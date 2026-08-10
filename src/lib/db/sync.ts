import { pool } from './pool'

export async function insertOpeningChecklistItems(openingId: string, items: string[]) {
  if (items.length === 0) return
  const values: any[] = []
  const rowsSql = items.map((title, i) => {
    values.push(openingId, title, i)
    return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  })
  await pool.query(
    `insert into opening_checklist_items (opening_id, title, sort_order) values ${rowsSql.join(', ')}`,
    values
  )
}

export async function insertSyncLog(input: {
  sync_type: string
  status: string
  message: string | null
  records_found: number
  records_created: number
  records_updated: number
  error_detail: string | null
  started_at: string
  finished_at: string
}) {
  await pool.query(
    `insert into sync_logs (sync_type, status, message, records_found, records_created, records_updated, error_detail, started_at, finished_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.sync_type, input.status, input.message, input.records_found, input.records_created,
      input.records_updated, input.error_detail, input.started_at, input.finished_at,
    ]
  )
}

export async function resetMonthlyPaymentStatus(monthName: string) {
  await pool.query(
    `update monthly_payment_values set payment_status = 'pendiente', paid_at = null, updated_at = now()
     where month = $1 and payment_status <> 'pendiente'`,
    [monthName]
  )
}

export async function listSyncLogs(limit = 50) {
  const { rows } = await pool.query(
    `select * from sync_logs order by started_at desc limit $1`,
    [limit]
  )
  return rows
}

export async function resetStuckSyncLogs(cutoffIso: string) {
  await pool.query(
    `update sync_logs set status = 'error', message = 'Timeout — se canceló automáticamente', finished_at = now()
     where status = 'running' and started_at < $1`,
    [cutoffIso]
  )
}

// ── Sync clientes ────────────────────────────────────────────────────────────

export async function getKnownClientsForSync() {
  const { rows } = await pool.query(`select id, item_id, client_number from clients`)
  return rows
}

export async function getKnownOpeningItemIds() {
  const { rows } = await pool.query(`select item_id from account_openings where item_id is not null`)
  return rows.map((r) => r.item_id as string)
}

export async function updateClientSharePointFieldsByItemId(itemId: string, fields: Record<string, any>) {
  const entries = Object.entries(fields)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(itemId)
  await pool.query(`update clients set ${setClause.join(', ')} where item_id = $${values.length}`, values)
}

export async function updateClientSharePointFieldsById(id: string, fields: Record<string, any>) {
  const entries = Object.entries(fields)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  await pool.query(`update clients set ${setClause.join(', ')} where id = $${values.length}`, values)
}

export async function insertPendingClient(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into clients (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning id`,
    values
  )
  return rows[0]
}

export async function insertAccountOpeningStub(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into account_openings (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning id`,
    values
  )
  return rows[0]
}

// ── Sync banco central ────────────────────────────────────────────────────────

export async function getBancoCentralByItemIds(itemIds: string[]) {
  if (itemIds.length === 0) return []
  const { rows } = await pool.query(
    `select id, item_id, customer_number from banco_central_records where item_id = ANY($1)`,
    [itemIds]
  )
  return rows
}

export async function getBancoCentralWithCustomerNumberByType(type: string) {
  const { rows } = await pool.query(
    `select id, item_id, customer_number from banco_central_records where type = $1 and customer_number is not null`,
    [type]
  )
  return rows
}

export async function getExistingBancoCentralFolderPaths(paths: string[]) {
  if (paths.length === 0) return []
  const { rows } = await pool.query(
    `select folder_path from banco_central_records where folder_path = ANY($1)`,
    [paths]
  )
  return rows.map((r) => r.folder_path as string)
}

export async function bulkInsertBancoCentralRecords(rows: Record<string, any>[]) {
  if (rows.length === 0) return
  const cols = Object.keys(rows[0])
  const values: any[] = []
  const rowsSql = rows.map((rec, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(rec[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(
    `insert into banco_central_records (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`,
    values
  )
}

export async function updateBancoCentralRecordById(id: string, fields: Record<string, any>) {
  const entries = Object.entries(fields)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  await pool.query(`update banco_central_records set ${setClause.join(', ')} where id = $${values.length}`, values)
}

// ── Sync recursos ─────────────────────────────────────────────────────────────

export async function getRecursoByItemId(itemId: string) {
  const { rows } = await pool.query(`select id from recursos where item_id = $1`, [itemId])
  return rows[0] ?? null
}

export async function insertRecurso(fields: Record<string, any>) {
  const cols = Object.keys(fields)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => fields[c])
  await pool.query(`insert into recursos (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')})`, values)
}

export async function updateRecursoById(id: string, fields: Record<string, any>) {
  const entries = Object.entries(fields)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  await pool.query(`update recursos set ${setClause.join(', ')} where id = $${values.length}`, values)
}

// ── Sync scoring_files ─────────────────────────────────────────────────────────

export async function getScoringFileByItemId(itemId: string) {
  const { rows } = await pool.query(`select id from scoring_files where item_id = $1`, [itemId])
  return rows[0] ?? null
}

export async function insertScoringFile(fields: Record<string, any>) {
  const cols = Object.keys(fields)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => fields[c])
  await pool.query(`insert into scoring_files (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')})`, values)
}

export async function updateScoringFileById(id: string, fields: Record<string, any>) {
  const entries = Object.entries(fields)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  await pool.query(`update scoring_files set ${setClause.join(', ')} where id = $${values.length}`, values)
}
