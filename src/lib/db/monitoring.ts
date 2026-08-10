import { pool } from './pool'

export async function listMonitoringRuns(entity: string) {
  const { rows } = await pool.query(
    `select * from monitoring_runs where entity = $1 order by period_year desc, period_quarter desc`,
    [entity]
  )
  return rows
}

export async function deleteMonitoringRun(id: string) {
  await pool.query(`delete from monitoring_runs where id = $1`, [id])
}

async function getInactiveAccountSets(entity: string) {
  const { rows } = await pool.query(
    `select account_number, account_name from monitoring_base_accounts where entity = $1 and is_active = false`,
    [entity]
  )
  const numbers = new Set<string>()
  const names = new Set<string>()
  for (const a of rows) {
    if (a.account_number) numbers.add(a.account_number.trim().toUpperCase())
    if (a.account_name) names.add(a.account_name.trim().toUpperCase())
  }
  return { numbers, names }
}

function excludeInactive<T extends { account_number: string | null; account_name: string | null }>(
  records: T[], inactive: { numbers: Set<string>; names: Set<string> }
) {
  return records.filter((r) => {
    const num = (r.account_number ?? '').trim().toUpperCase()
    const name = (r.account_name ?? '').trim().toUpperCase()
    return !((num && inactive.numbers.has(num)) || (name && inactive.names.has(name)))
  })
}

export async function getMonitoringRunRecords(runId: string) {
  const { rows: runRows } = await pool.query(`select entity from monitoring_runs where id = $1`, [runId])
  const entity = runRows[0]?.entity ?? 'roble'

  const inactive = await getInactiveAccountSets(entity)

  const { rows } = await pool.query(
    `select * from monitoring_records where monitoring_run_id = $1
     order by is_new_account asc, client_code asc nulls last, account_name asc nulls last`,
    [runId]
  )

  return excludeInactive(rows, inactive)
}

export async function getMonitoringRunMeta(runId: string) {
  const { rows } = await pool.query(
    `select period_year, period_quarter, created_at, entity from monitoring_runs where id = $1`,
    [runId]
  )
  return rows[0] ?? null
}

export async function updateMonitoringRecordExplanation(id: string, explanation: string | null) {
  const { rows } = await pool.query(
    `update monitoring_records set explanation = $1 where id = $2 returning id, explanation`,
    [explanation, id]
  )
  return rows[0] ?? null
}

export async function deleteMonitoringRecord(id: string) {
  await pool.query(`delete from monitoring_records where id = $1`, [id])
}

export async function listMonitoringBaseAccounts(entity: string) {
  const { rows } = await pool.query(
    `select * from monitoring_base_accounts where entity = $1
     order by is_active desc, needs_review desc, account_number asc`,
    [entity]
  )
  return rows
}

export async function upsertMonitoringBaseAccounts(accounts: Record<string, any>[]) {
  if (accounts.length === 0) return
  const cols = Object.keys(accounts[0])
  const values: any[] = []
  const rowsSql = accounts.map((acc, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(acc[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  const updateSet = cols.filter((c) => c !== 'account_number' && c !== 'entity').map((c) => `"${c}" = excluded."${c}"`)
  await pool.query(
    `insert into monitoring_base_accounts (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}
     on conflict (account_number, entity) do update set ${updateSet.join(', ')}`,
    values
  )
}

export async function upsertMonitoringBaseAccountsIgnoreDuplicates(accounts: Record<string, any>[]) {
  if (accounts.length === 0) return
  const cols = Object.keys(accounts[0])
  const values: any[] = []
  const rowsSql = accounts.map((acc, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(acc[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(
    `insert into monitoring_base_accounts (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}
     on conflict (account_number, entity) do nothing`,
    values
  )
}

export async function updateMonitoringBaseAccount(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update monitoring_base_accounts set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteMonitoringBaseAccount(id: string) {
  await pool.query(`delete from monitoring_base_accounts where id = $1`, [id])
}

export async function closeMonitoringAccount(accountNumber: string | null, accountName: string | null, entity: string) {
  const update = { is_active: false, comments: 'Cuenta cerrada' }
  if (accountNumber) {
    await pool.query(
      `update monitoring_base_accounts set is_active = false, comments = $1, updated_at = now()
       where account_number ilike $2 and entity = $3`,
      [update.comments, accountNumber.trim(), entity]
    )
  } else if (accountName) {
    await pool.query(
      `update monitoring_base_accounts set is_active = false, comments = $1, updated_at = now()
       where account_name ilike $2 and entity = $3`,
      [update.comments, accountName.trim(), entity]
    )
  }
}

export async function resolveMonitoringAccount(accountNumber: string) {
  const { rows: affected } = await pool.query(
    `select distinct monitoring_run_id from monitoring_records where account_number ilike $1 and is_new_account = true`,
    [accountNumber.trim()]
  )
  const runIds = affected.map((r) => r.monitoring_run_id)

  await pool.query(
    `update monitoring_records set is_new_account = false where account_number ilike $1`,
    [accountNumber.trim()]
  )

  for (const runId of runIds) {
    const { rows: countRows } = await pool.query(
      `select count(*) from monitoring_records where monitoring_run_id = $1 and is_new_account = true`,
      [runId]
    )
    await pool.query(
      `update monitoring_runs set new_accounts_detected = $1 where id = $2`,
      [parseInt(countRows[0].count, 10), runId]
    )
  }
  return runIds.length
}

// ─── create run (complex) ───────────────────────────────────────────────────

export async function getLegajosForEntity(legajosType: string) {
  const { rows } = await pool.query(
    `select customer_number, folder_name from banco_central_records where type = $1`,
    [legajosType]
  )
  return rows
}

export async function getBaseAccountsWithClientCode(entity: string) {
  const { rows } = await pool.query(
    `select account_number, account_name, client_code from monitoring_base_accounts
     where entity = $1 and client_code is not null`,
    [entity]
  )
  return rows
}

export async function getBaseAccountsActivity(entity: string) {
  const { rows } = await pool.query(
    `select account_number, account_name, is_active from monitoring_base_accounts where entity = $1`,
    [entity]
  )
  return rows
}

export async function createMonitoringRun(input: {
  period_year: number; period_quarter: number; original_file_name: string | null
  created_by: string; entity: string
  total_accounts: number; accounts_with_deviation: number; accounts_without_deviation: number; new_accounts_detected: number
}) {
  const { rows } = await pool.query(
    `insert into monitoring_runs (period_year, period_quarter, original_file_name, created_by, entity,
       total_accounts, accounts_with_deviation, accounts_without_deviation, new_accounts_detected, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed') returning id`,
    [
      input.period_year, input.period_quarter, input.original_file_name, input.created_by, input.entity,
      input.total_accounts, input.accounts_with_deviation, input.accounts_without_deviation, input.new_accounts_detected,
    ]
  )
  return rows[0]
}

export async function insertMonitoringRecordsBatch(records: Record<string, any>[]) {
  if (records.length === 0) return
  const cols = Object.keys(records[0])
  const values: any[] = []
  const rowsSql = records.map((rec, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(rec[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(
    `insert into monitoring_records (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`,
    values
  )
}
