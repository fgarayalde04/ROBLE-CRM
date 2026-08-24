import { pool } from './pool'
import type { ParsedPortfolioImport } from '@/lib/portfolio/parser'
import type { ParsedCashProjections } from '@/lib/portfolio/cashProjectionsParser'
import type { ParsedPerformanceReport } from '@/lib/portfolio/performancePdfParser'
import type { ParsedUnrealizedGainLoss } from '@/lib/portfolio/unrealizedGainLossParser'

export interface ResolvedAccount {
  id:            string | null
  accountNumber: string
  clientNumber:  string | null
  clientName:    string | null
  accountName:   string | null   // manual fallback name (monitoring_base_accounts.account_name) — used when there's no matched client
  advisor:       string | null
  entity:        string | null
  custodian:     string | null
}

// Resolves an account number (e.g. "ROJ902303") against monitoring_base_accounts
// + clients to get a display name / advisor for scoping. Accounts not present
// there (not yet in master data) still import fine — just without a resolved name.
export async function resolveAccount(accountNumber: string): Promise<ResolvedAccount> {
  const { rows } = await pool.query(
    `select mba.id, mba.account_number, mba.client_code as client_number, mba.entity, mba.custodian, mba.account_name,
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
      id:           rows[0].id ?? null,
      accountNumber,
      clientNumber: rows[0].client_number ?? null,
      clientName:   rows[0].client_name?.trim() || null,
      accountName:  rows[0].account_name?.trim() || null,
      advisor:      rows[0].advisor ?? null,
      entity:       rows[0].entity ?? null,
      custodian:    rows[0].custodian ?? null,
    }
  }
  return { id: null, accountNumber, clientNumber: null, clientName: null, accountName: null, advisor: null, entity: null, custodian: null }
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
        'isin','cusip','maturity_date','purchase_date','coupon','accrued_interest','fund_family','dividend_policy']
      const values: unknown[] = []
      const rowsSql = input.parsed.positions.map((p, idx) => {
        const base = idx * cols.length
        values.push(
          importRow.id, input.accountNumber, input.parsed.snapshotDate, p.symbol, p.name, p.securityType,
          p.assetClass, p.region, p.sector, p.currency, p.quantity, p.price, p.marketValue, p.weight,
          p.isin, p.cusip, p.maturityDate, p.purchaseDate, p.coupon, p.accruedInterest, p.fundFamily, p.dividendPolicy
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

// Wipes every portfolio import (positions, cash projections, performance,
// unrealized gain/loss — all snapshot dates, not just the latest) for an
// account. Child rows cascade via FK. Irreversible — used by the "eliminar
// portafolio" action on the accounts landing page.
export async function deletePortfolioAccount(accountNumber: string) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`delete from portfolio_imports where account_number = $1`, [accountNumber])
    await client.query(`delete from portfolio_cash_projections_imports where account_number = $1`, [accountNumber])
    await client.query(`delete from portfolio_unrealized_gainloss_imports where account_number = $1`, [accountNumber])
    await client.query(`delete from portfolio_performance_imports where account_number = $1`, [accountNumber])
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
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
    where = `where pi.advisor = ANY($${params.length})`
  }
  // Falls back to the manually-entered account_name (monitoring_base_accounts)
  // when the import has no resolved client_name — same fallback as the
  // account detail page, so a name typed in there shows up here too.
  const { rows } = await pool.query(
    `select distinct on (pi.account_number) pi.*, coalesce(nullif(pi.client_name, ''), nullif(mba.account_name, '')) as client_name
     from portfolio_imports pi
     left join monitoring_base_accounts mba on mba.account_number = pi.account_number
     ${where}
     order by pi.account_number, pi.snapshot_date desc`,
    params
  )
  return rows.sort((a, b) => (a.client_name ?? a.account_number).localeCompare(b.client_name ?? b.account_number))
}

// ── Performance (Portfolio Performance PDF — real TWRR, never calculated) ──

export async function createPerformanceImport(input: {
  parsed: ParsedPerformanceReport
  accountNumber: string
  fileName: string
  importedBy: string
  importedById: string
}) {
  const p = input.parsed
  const { rows } = await pool.query(
    `insert into portfolio_performance_imports
      (account_number, report_date, period_start, period_end, inception_date, ending_value,
       return_selected, return_ytd, return_1y, return_3y, return_5y, return_since_inception,
       benchmarks, file_name, imported_by, imported_by_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
     on conflict (account_number, report_date) do update set
       period_start = excluded.period_start, period_end = excluded.period_end,
       inception_date = excluded.inception_date, ending_value = excluded.ending_value,
       return_selected = excluded.return_selected, return_ytd = excluded.return_ytd,
       return_1y = excluded.return_1y, return_3y = excluded.return_3y, return_5y = excluded.return_5y,
       return_since_inception = excluded.return_since_inception, benchmarks = excluded.benchmarks,
       file_name = excluded.file_name, imported_by = excluded.imported_by, imported_by_id = excluded.imported_by_id,
       created_at = now()
     returning *`,
    [
      input.accountNumber, p.reportDate, p.periodStart, p.periodEnd, p.inceptionDate, p.endingValue,
      p.returns.selected, p.returns.ytd, p.returns.oneYear, p.returns.threeYear, p.returns.fiveYear, p.returns.sinceInception,
      JSON.stringify(p.benchmarks), input.fileName, input.importedBy, input.importedById,
    ]
  )
  return rows[0]
}

export async function getLatestPerformance(accountNumber: string) {
  const { rows } = await pool.query(
    `select * from portfolio_performance_imports where account_number = $1 order by report_date desc limit 1`,
    [accountNumber]
  )
  return rows[0] ?? null
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

// ── Unrealized Gain/Loss (real Cost Basis — never calculated by us) ────────

export async function createUnrealizedGainLossImport(input: {
  parsed: ParsedUnrealizedGainLoss
  accountNumber: string
  fileName: string
  importedBy: string
  importedById: string
}) {
  const client = await pool.connect()
  try {
    await client.query('begin')

    // Enrichment data, not a versioned snapshot — re-importing the same
    // account+date replaces the previous rows outright.
    await client.query(
      `delete from portfolio_unrealized_gainloss_imports where account_number = $1 and as_of_date = $2`,
      [input.accountNumber, input.parsed.asOfDate]
    )

    const { rows } = await client.query(
      `insert into portfolio_unrealized_gainloss_imports (account_number, as_of_date, net_gain_loss, file_name, imported_by, imported_by_id)
       values ($1,$2,$3,$4,$5,$6)
       returning *`,
      [input.accountNumber, input.parsed.asOfDate, input.parsed.netGainLoss, input.fileName, input.importedBy, input.importedById]
    )
    const importRow = rows[0]

    if (input.parsed.rows.length > 0) {
      const cols = ['import_id', 'account_number', 'cusip', 'security_identifier', 'description', 'quantity', 'cost_basis', 'market_value', 'gain_loss', 'gain_loss_pct']
      const values: unknown[] = []
      const rowsSql = input.parsed.rows.map((r, idx) => {
        const base = idx * cols.length
        values.push(importRow.id, input.accountNumber, r.cusip, r.securityIdentifier, r.description, r.quantity, r.costBasis, r.marketValue, r.gainLoss, r.gainLossPct)
        return `(${cols.map((_, i) => `$${base + i + 1}`).join(',')})`
      })
      await client.query(`insert into portfolio_unrealized_gainloss (${cols.join(',')}) values ${rowsSql.join(',')}`, values)
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

export async function getLatestUnrealizedGainLoss(accountNumber: string) {
  const { rows: imports } = await pool.query(
    `select * from portfolio_unrealized_gainloss_imports where account_number = $1 order by as_of_date desc limit 1`,
    [accountNumber]
  )
  const importRow = imports[0] ?? null
  if (!importRow) return { importRow: null, rows: [] }
  const { rows } = await pool.query(
    `select * from portfolio_unrealized_gainloss where import_id = $1 order by gain_loss desc`,
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
