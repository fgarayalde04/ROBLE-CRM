import { pool } from './pool'

export async function listTaxRecords() {
  const { rows } = await pool.query(
    `select * from tax_records order by sort_order asc, company asc, tax_name asc`
  )
  return rows
}

export async function addTaxRecord(input: {
  tax_name: string; company: string; official_link?: string | null; due_date?: string | null; comment?: string | null
}) {
  const { rows: maxData } = await pool.query(`select sort_order from tax_records order by sort_order desc limit 1`)
  const maxOrder = maxData.length > 0 ? maxData[0].sort_order : -1

  const { rows } = await pool.query(
    `insert into tax_records (tax_name, company, official_link, due_date, comment, status, sort_order)
     values ($1, $2, $3, $4, $5, 'pendiente', $6) returning *`,
    [input.tax_name, input.company, input.official_link ?? null, input.due_date ?? null, input.comment ?? null, maxOrder + 1]
  )
  return rows[0]
}

export async function seedTaxRecords() {
  const seeds = [
    { tax_name: 'BPS', company: 'roble', official_link: 'https://servicios.bps.gub.uy', comment: 'Mensual' },
    { tax_name: 'DGI', company: 'roble', official_link: 'https://www.dgi.gub.uy', comment: 'Mensual' },
    { tax_name: 'BPS IRPF', company: 'roble', official_link: 'https://servicios.bps.gub.uy', comment: null },
    { tax_name: 'BPS', company: 'geliene', official_link: 'https://servicios.bps.gub.uy', comment: null },
    { tax_name: 'DGI', company: 'geliene', official_link: 'https://www.dgi.gub.uy', comment: null },
    { tax_name: 'BPS IRPF', company: 'geliene', official_link: 'https://servicios.bps.gub.uy', comment: null },
  ]

  let inserted = 0
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const { rows: existing } = await pool.query(
      `select id from tax_records where tax_name = $1 and company = $2 limit 1`,
      [seed.tax_name, seed.company]
    )
    if (existing.length > 0) continue

    await pool.query(
      `insert into tax_records (tax_name, company, official_link, comment, status, sort_order)
       values ($1, $2, $3, $4, 'pendiente', $5)`,
      [seed.tax_name, seed.company, seed.official_link, seed.comment, i]
    )
    inserted++
  }
  return inserted
}

export async function updateTaxRecord(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update tax_records set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function toggleTaxStatus(id: string, status: string) {
  const { rows } = await pool.query(
    `update tax_records set status = $1, paid_at = $2, updated_at = now() where id = $3 returning *`,
    [status, status === 'pagado' ? new Date().toISOString() : null, id]
  )
  return rows[0] ?? null
}

export async function deleteTaxRecord(id: string) {
  await pool.query(`delete from tax_records where id = $1`, [id])
}
