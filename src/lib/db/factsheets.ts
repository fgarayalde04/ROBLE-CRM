import { pool } from './pool'

export async function listFactsheets(clientName: string) {
  const where: string[] = []
  const params: any[] = []
  if (clientName) { params.push(`%${clientName}%`); where.push(`client_name ilike $${params.length}`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select id, client_name, report_date, quarter, advisor, total_value, risk_profile, created_at
     from factsheets ${whereClause} order by created_at desc limit 100`,
    params
  )
  return rows
}

export async function createFactsheet(input: {
  client_name: string
  report_date: string
  quarter: string
  advisor: string
  benchmark: string
  total_value: number
  risk_score: number | null
  risk_profile: string
  data: unknown
  created_by: string
}) {
  const { rows } = await pool.query(
    `insert into factsheets (client_name, report_date, quarter, advisor, benchmark, total_value, risk_score, risk_profile, data, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) returning id`,
    [
      input.client_name, input.report_date, input.quarter, input.advisor, input.benchmark,
      input.total_value, input.risk_score, input.risk_profile, JSON.stringify(input.data), input.created_by,
    ]
  )
  return rows[0]
}

export async function deleteFactsheet(id: string) {
  await pool.query(`delete from factsheets where id = $1`, [id])
}
