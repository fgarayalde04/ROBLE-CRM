import { pool } from './pool'

const DEFAULT_EXCHANGE_RATE = 39.65

export function parseRawValue(raw: string): { value: number | null; raw_value: string } {
  if (!raw || raw.trim() === '' || raw.trim() === '?') {
    return { value: null, raw_value: raw.trim() || '' }
  }
  const n = parseFloat(raw.replace(',', '.'))
  if (isNaN(n)) return { value: null, raw_value: raw.trim() }
  return { value: n, raw_value: raw.trim() }
}

export async function getOrCreatePaymentTable(company: string, year: number) {
  const { rows } = await pool.query(
    `select * from monthly_payment_tables where company = $1 and year = $2`,
    [company, year]
  )
  if (rows[0]) return rows[0]

  const { rows: created } = await pool.query(
    `insert into monthly_payment_tables (company, year, exchange_rate) values ($1, $2, $3) returning *`,
    [company, year, DEFAULT_EXCHANGE_RATE]
  )
  return created[0]
}

export async function listPaymentTables() {
  const { rows } = await pool.query(`select * from monthly_payment_tables order by year asc`)
  return rows
}

export async function fetchPaymentTableRows(tableId: string) {
  const { rows: rawRows } = await pool.query(
    `select id, concept, expense_type, category, comment, sort_order
     from monthly_payment_rows where table_id = $1 order by sort_order asc`,
    [tableId]
  )
  if (rawRows.length === 0) return []

  const rowIds = rawRows.map((r) => r.id)
  const { rows: rawValues } = await pool.query(
    `select id, row_id, month, value, raw_value, payment_status, paid_at
     from monthly_payment_values where row_id = ANY($1)`,
    [rowIds]
  )

  const valuesByRow: Record<string, Record<string, any>> = {}
  for (const v of rawValues) {
    if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
    valuesByRow[v.row_id][v.month] = {
      id: v.id, value: v.value, raw_value: v.raw_value,
      payment_status: v.payment_status ?? undefined, paid_at: v.paid_at,
    }
  }

  return rawRows.map((row) => ({
    id: row.id,
    concept: row.concept,
    expense_type: row.expense_type,
    category: row.category,
    comment: row.comment,
    sort_order: row.sort_order,
    values: valuesByRow[row.id] ?? {},
  }))
}

export async function createPaymentYear(company: string, year: number, fromYear?: number) {
  const { rows: newRows } = await pool.query(
    `insert into monthly_payment_tables (company, year, exchange_rate) values ($1, $2, $3) returning *`,
    [company, year, DEFAULT_EXCHANGE_RATE]
  )
  const newTable = newRows[0]

  if (fromYear) {
    const { rows: sourceRows } = await pool.query(
      `select id from monthly_payment_tables where company = $1 and year = $2`,
      [company, fromYear]
    )
    const sourceTable = sourceRows[0]
    if (sourceTable) {
      const { rows: sourceTableRows } = await pool.query(
        `select concept, expense_type, category, comment, sort_order
         from monthly_payment_rows where table_id = $1 order by sort_order asc`,
        [sourceTable.id]
      )
      if (sourceTableRows.length > 0) {
        const values: any[] = []
        const placeholders = sourceTableRows.map((r, i) => {
          values.push(newTable.id, r.concept, r.expense_type, r.category, r.comment, r.sort_order)
          return `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        })
        await pool.query(
          `insert into monthly_payment_rows (table_id, concept, expense_type, category, comment, sort_order) values ${placeholders.join(', ')}`,
          values
        )
      }
    }
  }

  return newTable
}

export async function addPaymentRow(tableId: string, concept: string, expenseType: string, category: string) {
  const { rows: existing } = await pool.query(
    `select sort_order from monthly_payment_rows where table_id = $1 order by sort_order desc limit 1`,
    [tableId]
  )
  const maxOrder = existing.length > 0 ? existing[0].sort_order : -1

  const { rows } = await pool.query(
    `insert into monthly_payment_rows (table_id, concept, expense_type, category, sort_order)
     values ($1, $2, $3, $4, $5) returning *`,
    [tableId, concept, expenseType, category, maxOrder + 1]
  )
  return rows[0]
}

export async function copyPaymentMonth(tableId: string, sourceMonth: string, targetMonth: string, copyValues: boolean) {
  const { rows: sourceRows } = await pool.query(
    `select id from monthly_payment_rows where table_id = $1`,
    [tableId]
  )
  if (sourceRows.length === 0) return 0

  let rowsCopied = 0
  for (const row of sourceRows) {
    let valueToUpsert: number | null = null
    let rawValueToUpsert: string | null = null

    if (copyValues) {
      const { rows: srcVal } = await pool.query(
        `select value, raw_value from monthly_payment_values where row_id = $1 and month = $2`,
        [row.id, sourceMonth]
      )
      if (srcVal[0]) {
        valueToUpsert = srcVal[0].value
        rawValueToUpsert = srcVal[0].raw_value
      }
    }

    try {
      await pool.query(
        `insert into monthly_payment_values (row_id, month, value, raw_value, payment_status, paid_at, updated_at)
         values ($1, $2, $3, $4, 'pendiente', null, now())
         on conflict (row_id, month) do nothing`,
        [row.id, targetMonth, valueToUpsert, rawValueToUpsert]
      )
      rowsCopied++
    } catch { /* skip */ }
  }
  return rowsCopied
}

export async function updateExchangeRate(tableId: string, exchangeRate: number) {
  const { rows } = await pool.query(
    `update monthly_payment_tables set exchange_rate = $1, updated_at = now() where id = $2 returning *`,
    [exchangeRate, tableId]
  )
  return rows[0] ?? null
}

export async function upsertPaymentValue(rowId: string, month: string, rawValue: string) {
  const parsed = parseRawValue(rawValue)
  const { rows } = await pool.query(
    `insert into monthly_payment_values (row_id, month, value, raw_value, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (row_id, month) do update set value = excluded.value, raw_value = excluded.raw_value, updated_at = excluded.updated_at
     returning *`,
    [rowId, month, parsed.value, parsed.raw_value]
  )
  return rows[0]
}

export async function updatePaymentRow(rowId: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(rowId)
  const { rows } = await pool.query(
    `update monthly_payment_rows set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function togglePaymentStatus(rowId: string, month: string, status: 'pendiente' | 'pagado') {
  const { rows } = await pool.query(
    `insert into monthly_payment_values (row_id, month, payment_status, paid_at, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (row_id, month) do update set payment_status = excluded.payment_status, paid_at = excluded.paid_at, updated_at = excluded.updated_at
     returning *`,
    [rowId, month, status, status === 'pagado' ? new Date().toISOString() : null]
  )
  return rows[0]
}

export async function resetMonthPaymentStatus(month: string) {
  await pool.query(
    `update monthly_payment_values set payment_status = 'pendiente', paid_at = null, updated_at = now()
     where month = $1 and payment_status != 'pendiente'`,
    [month]
  )
}

export async function toggleClosedMonth(tableId: string, month: string) {
  const { rows } = await pool.query(`select closed_months from monthly_payment_tables where id = $1`, [tableId])
  const currentClosed: string[] = rows[0]?.closed_months ?? []
  const newClosed = currentClosed.includes(month)
    ? currentClosed.filter((m) => m !== month)
    : [...currentClosed, month]

  const { rows: updated } = await pool.query(
    `update monthly_payment_tables set closed_months = $1, updated_at = now() where id = $2 returning *`,
    [newClosed, tableId]
  )
  return updated[0] ?? null
}

export async function deletePaymentRow(rowId: string) {
  await pool.query(`delete from monthly_payment_rows where id = $1`, [rowId])
}
