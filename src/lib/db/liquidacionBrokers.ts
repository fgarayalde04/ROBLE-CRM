import { pool } from './pool'

const MONTH_ORDER: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
}

export function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0'), yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })
}

export async function getOrCreateBrokerTable(advisor: string, company: string, year: number) {
  const { rows } = await pool.query(
    `select * from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
    [advisor, company, year]
  )
  if (rows[0]) return rows[0]

  const { rows: created } = await pool.query(
    `insert into broker_settlement_tables (advisor_name, company, year) values ($1, $2, $3) returning *`,
    [advisor, company, year]
  )
  return created[0]
}

export async function listBrokerTables() {
  const { rows } = await pool.query(`select * from broker_settlement_tables order by created_at desc`)
  return rows
}

export async function fetchBrokerRows(tableId: string) {
  const { rows: rawRows } = await pool.query(
    `select * from broker_settlement_rows where table_id = $1 order by sort_order asc`,
    [tableId]
  )
  if (rawRows.length === 0) return { rows: [], months: [] }

  const rowIds = rawRows.map((r) => r.id)
  const { rows: rawValues } = await pool.query(
    `select * from broker_settlement_values where row_id = ANY($1)`,
    [rowIds]
  )

  const allMonths = new Set<string>()
  const valuesByRow: Record<string, Record<string, any>> = {}

  for (const v of rawValues) {
    if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
    valuesByRow[v.row_id][v.month] = { id: v.id, value: v.value, raw_value: v.raw_value }
    allMonths.add(v.month)
  }

  const rows = rawRows.map((r) => ({
    id: r.id,
    concept: r.concept,
    sort_order: r.sort_order,
    is_formula: r.is_formula,
    formula_type: r.formula_type,
    values: valuesByRow[r.id] ?? {},
  }))

  return { rows, months: sortMonths(Array.from(allMonths)) }
}

export async function addMonthColumn(tableId: string, month: string) {
  const { rows: existingRows } = await pool.query(
    `select id from broker_settlement_rows where table_id = $1`,
    [tableId]
  )
  if (existingRows.length === 0) return { noop: true, inserted: 0 }

  const rowIds = existingRows.map((r) => r.id)
  const { rows: existingValues } = await pool.query(
    `select id from broker_settlement_values where row_id = ANY($1) and month = $2 limit 1`,
    [rowIds, month]
  )
  if (existingValues.length > 0) return { noop: true, inserted: 0 }

  const values: any[] = []
  const placeholders = rowIds.map((id, i) => {
    values.push(id, month)
    return `($${i * 2 + 1}, $${i * 2 + 2}, null, null)`
  })
  await pool.query(
    `insert into broker_settlement_values (row_id, month, value, raw_value) values ${placeholders.join(', ')}`,
    values
  )
  return { noop: false, inserted: rowIds.length }
}

export async function addBrokerRow(tableId: string, concept: string, isFormula: boolean, formulaType: string | null) {
  const { rows: maxRows } = await pool.query(
    `select sort_order from broker_settlement_rows where table_id = $1 order by sort_order desc limit 1`,
    [tableId]
  )
  const nextOrder = maxRows[0] ? maxRows[0].sort_order + 1 : 0

  const { rows } = await pool.query(
    `insert into broker_settlement_rows (table_id, concept, sort_order, is_formula, formula_type)
     values ($1, $2, $3, $4, $5) returning *`,
    [tableId, concept, nextOrder, isFormula, formulaType]
  )
  return rows[0]
}

export async function createBrokerYear(advisor: string, company: string, targetYear: number, sourceYear?: number) {
  const { rows: existingRows } = await pool.query(
    `select * from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
    [advisor, company, targetYear]
  )
  if (existingRows[0]) return { existing: true, table: existingRows[0] }

  const { rows: newRows } = await pool.query(
    `insert into broker_settlement_tables (advisor_name, company, year) values ($1, $2, $3) returning *`,
    [advisor, company, targetYear]
  )
  const newTable = newRows[0]

  if (sourceYear) {
    const { rows: sourceTableRows } = await pool.query(
      `select id from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
      [advisor, company, sourceYear]
    )
    const sourceTable = sourceTableRows[0]
    if (sourceTable) {
      const { rows: sourceRows } = await pool.query(
        `select concept, sort_order, is_formula, formula_type from broker_settlement_rows where table_id = $1 order by sort_order`,
        [sourceTable.id]
      )
      if (sourceRows.length > 0) {
        const values: any[] = []
        const placeholders = sourceRows.map((r, i) => {
          values.push(newTable.id, r.concept, r.sort_order, r.is_formula, r.formula_type)
          return `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        })
        await pool.query(
          `insert into broker_settlement_rows (table_id, concept, sort_order, is_formula, formula_type) values ${placeholders.join(', ')}`,
          values
        )
      }
    }
  }

  return { existing: false, table: newTable }
}

export async function upsertBrokerValue(rowId: string, month: string, rawValue: string) {
  const parsed = parseFloat(String(rawValue).replace(',', '.'))
  const numericValue = isNaN(parsed) ? null : parsed
  await pool.query(
    `insert into broker_settlement_values (row_id, month, value, raw_value, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (row_id, month) do update set value = excluded.value, raw_value = excluded.raw_value, updated_at = excluded.updated_at`,
    [rowId, month, numericValue, rawValue]
  )
}

export async function updateBrokerRow(rowId: string, updates: { concept?: string; sort_order?: number }) {
  const set: string[] = ['updated_at = now()']
  const values: any[] = []
  if (updates.concept !== undefined) { values.push(updates.concept); set.push(`concept = $${values.length}`) }
  if (updates.sort_order !== undefined) { values.push(updates.sort_order); set.push(`sort_order = $${values.length}`) }
  values.push(rowId)
  await pool.query(`update broker_settlement_rows set ${set.join(', ')} where id = $${values.length}`, values)
}

export async function deleteBrokerRow(rowId: string) {
  await pool.query(`delete from broker_settlement_rows where id = $1`, [rowId])
}
