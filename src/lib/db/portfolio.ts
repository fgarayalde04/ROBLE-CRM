import { pool } from './pool'
import type { ParsedPortfolioImport } from '@/lib/portfolio/parser'
import type { ParsedCashProjections } from '@/lib/portfolio/cashProjectionsParser'

export interface ResolvedAccount {
  accountNumber: string
  clientNumber:  string | null
  clientName:    string | null
  advisor:       string | null
  entity:        string | null
}

// Resolves an account number (e.g. "ROJ902303") against monitoring_base_accounts
// + clients to get a display name / advisor for scoping. Accounts not present
// there (not yet in master data) still import fine — just without a resolved name.
export async function resolveAccount(accountNumber: string): Promise<ResolvedAccount> {
  const { rows } = await pool.query(
    `select mba.account_number, mba.client_code as client_number, mba.entity,
            trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as client_name,
            c.advisor
     from monitoring_base_accounts mba
     left join clients c on c.client_number = mba.client_code
     where mba.account_number = $1
     limit 1`,
    [accountNumber]
  )
  if (rows[0]) {
    return {
      accountNumber,
      clientNumber: rows[0].client_number ?? null,
      clientName:   rows[0].client_name?.trim() || null,
      advisor:      rows[0].advisor ?? null,
      entity:       rows[0].entity ?? null,
    }
  }
  return { accountNumber, clientNumber: null, clientName: null, advisor: null, entity: null }
}

export async function findImportByAccountAndDate(accountNumber: string, snapshotDate: string) {
  const { rows } = await pool.query(
    `select * from portfolio_imports where account_number = $1 and snapshot_date = $2`,
    [accountNumber, snapshotDate]
  )
  return rows[0] ?? null
}

export async function createImport(input: {
  parsed: ParsedPortfolioImport
  accountNumber: string
  clientNumber: string | null
  clientName: string | null
  advisor: string | null
  fileName: string
  importedBy: string
  importedById: string
}) {
  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows } = await client.query(
      `insert into portfolio_imports
        (account_number, client_number, client_name, advisor, snapshot_date, base_currency,
         total_market_value, position_count, file_name, warnings, imported_by, imported_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
       returning *`,
      [
        input.accountNumber, input.clientNumber, input.clientName, input.advisor,
        input.parsed.snapshotDate, input.parsed.baseCurrency, input.parsed.totalMarketValue,
        input.parsed.positions.length, input.fileName, JSON.stringify(input.parsed.warnings),
        input.importedBy, input.importedById,
      ]
    )
    const importRow = rows[0]

    if (input.parsed.positions.length > 0) {
      const cols = ['import_id','account_number','snapshot_date','symbol','name','security_type',
        'asset_class','region','sector','currency','quantity','price','market_value','weight_pct',
        'isin','cusip','maturity_date','coupon','accrued_interest','fund_family','dividend_policy']
      const values: unknown[] = []
      const rowsSql = input.parsed.positions.map((p, idx) => {
        const base = idx * cols.length
        values.push(
          importRow.id, input.accountNumber, input.parsed.snapshotDate, p.symbol, p.name, p.securityType,
          p.assetClass, p.region, p.sector, p.currency, p.quantity, p.price, p.marketValue, p.weight,
          p.isin, p.cusip, p.maturityDate, p.coupon, p.accruedInterest, p.fundFamily, p.dividendPolicy
        )
        return `(${cols.map((_, i) => `$${base + i + 1}`).join(',')})`
      })
      await client.query(
        `insert into portfolio_positions_snapshot (${cols.join(',')}) values ${rowsSql.join(',')}`,
        values
      )
    }

    await client.query('commit')
    return importRow
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

// Cascade-deletes the import's positions too (FK on delete cascade). Used only
// for the explicit "replace this snapshot" flow — never called implicitly.
export async function deleteImport(importId: string) {
  await pool.query(`delete from portfolio_imports where id = $1`, [importId])
}

export async function getImport(importId: string) {
  const { rows } = await pool.query(`select * from portfolio_imports where id = $1`, [importId])
  return rows[0] ?? null
}

export async function getLatestImport(accountNumber: string) {
  const { rows } = await pool.query(
    `select * from portfolio_imports where account_number = $1 order by snapshot_date desc limit 1`,
    [accountNumber]
  )
  return rows[0] ?? null
}

export async function getImportByDate(accountNumber: string, snapshotDate: string) {
  const { rows } = await pool.query(
    `select * from portfolio_imports where account_number = $1 and snapshot_date = $2`,
    [accountNumber, snapshotDate]
  )
  return rows[0] ?? null
}

export async function getPositions(importId: string) {
  const { rows } = await pool.query(
    `select * from portfolio_positions_snapshot where import_id = $1 order by market_value desc`,
    [importId]
  )
  return rows
}

export async function listSnapshotDates(accountNumber: string) {
  const { rows } = await pool.query(
    `select id, snapshot_date, total_market_value, position_count
     from portfolio_imports where account_number = $1 order by snapshot_date asc`,
    [accountNumber]
  )
  return rows
}

// One row per account — most recent import only — for the Portafolio landing
// page. Scoped by advisor the same way src/app/clients does (allowed_folders).
export async function listAccounts(advisorFilter: string[] | null) {
  const params: unknown[] = []
  let where = ''
  if (advisorFilter) {
    params.push(advisorFilter)
    where = `where advisor = ANY($${params.length})`
  }
  const { rows } = await pool.query(
    `select distinct on (account_number) *
     from portfolio_imports
     ${where}
     order by account_number, snapshot_date desc`,
    params
  )
  return rows.sort((a, b) => (a.client_name ?? a.account_number).localeCompare(b.client_name ?? b.account_number))
}

// ── Cash projections (Incoming Cash Projections Excel) ─────────────────────

export async function createCashProjectionsImport(input: {
  parsed: ParsedCashProjections
  accountNumber: string
  fileName: string
  importedBy: string
  importedById: string
}) {
  const client = await pool.connect()
  try {
    await client.query('begin')

    // Re-importing the same account+date replaces the previous rows outright —
    // this is enrichment data, not a versioned snapshot like positions.
    await client.query(
      `delete from portfolio_cash_projections_imports where account_number = $1 and as_of_date = $2`,
      [input.accountNumber, input.parsed.asOfDate]
    )

    const { rows } = await client.query(
      `insert into portfolio_cash_projections_imports (account_number, as_of_date, total_cash_flow, file_name, imported_by, imported_by_id)
       values ($1,$2,$3,$4,$5,$6)
       returning *`,
      [input.accountNumber, input.parsed.asOfDate, input.parsed.totalCashFlow, input.fileName, input.importedBy, input.importedById]
    )
    const importRow = rows[0]

    if (input.parsed.rows.length > 0) {
      const cols = ['import_id', 'account_number', 'pay_date', 'security_identifier', 'distribution_type', 'cusip', 'description', 'quantity', 'coupon_pct', 'estimated_amount']
      const values: unknown[] = []
      const rowsSql = input.parsed.rows.map((r, idx) => {
        const base = idx * cols.length
        values.push(importRow.id, input.accountNumber, r.payDate, r.securityIdentifier, r.distributionType, r.cusip, r.description, r.quantity, r.couponPct, r.estimatedAmount)
        return `(${cols.map((_, i) => `$${base + i + 1}`).join(',')})`
      })
      await client.query(`insert into portfolio_cash_projections (${cols.join(',')}) values ${rowsSql.join(',')}`, values)
    }

    await client.query('commit')
    return importRow
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

export async function getLatestCashProjections(accountNumber: string) {
  const { rows: imports } = await pool.query(
    `select * from portfolio_cash_projections_imports where account_number = $1 order by as_of_date desc limit 1`,
    [accountNumber]
  )
  const importRow = imports[0] ?? null
  if (!importRow) return { importRow: null, rows: [] }
  const { rows } = await pool.query(
    `select * from portfolio_cash_projections where import_id = $1 order by pay_date asc`,
    [importRow.id]
  )
  return { importRow, rows }
}

export async function listImportHistory(advisorFilter: string[] | null, accountNumber?: string | null) {
  const params: unknown[] = []
  const where: string[] = []
  if (advisorFilter) { params.push(advisorFilter); where.push(`advisor = ANY($${params.length})`) }
  if (accountNumber) { params.push(accountNumber); where.push(`account_number = $${params.length}`) }
  const whereClause = where.length ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from portfolio_imports ${whereClause} order by created_at desc limit 200`,
    params
  )
  return rows
}
