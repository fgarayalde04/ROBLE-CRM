import { pool } from './pool'

export async function getInboxTasks() {
  const { rows } = await pool.query(
    `select t.*, c.first_name as c_first_name, c.last_name as c_last_name
     from tasks t
     left join clients c on c.id = t.client_id
     where t.status <> 'completado'
     order by t.due_date asc nulls last`
  )
  return rows.map((r) => {
    const { c_first_name, c_last_name, ...rest } = r
    return { ...rest, clients: c_first_name ? { first_name: c_first_name, last_name: c_last_name } : null }
  })
}

export async function getInboxOpenings() {
  const { rows } = await pool.query(
    `select o.*, c.id as c_id, c.first_name as c_first_name, c.last_name as c_last_name, c.client_number as c_client_number
     from account_openings o
     left join clients c on c.id = o.client_id
     where o.status not in ('cuenta_abierta', 'descartado')
     order by o.updated_at asc`
  )
  return rows.map((r) => {
    const { c_id, c_first_name, c_last_name, c_client_number, ...rest } = r
    return {
      ...rest,
      client: c_id ? { id: c_id, first_name: c_first_name, last_name: c_last_name, client_number: c_client_number } : null,
    }
  })
}

export async function getInboxBcuStatuses() {
  const { rows } = await pool.query(`select id, status from banco_central_records`)
  return rows
}

export async function getInboxRecentClients(since: string) {
  const { rows } = await pool.query(
    `select id, client_number, first_name, last_name, status, advisor, created_at, updated_at
     from clients where created_at >= $1 order by created_at desc`,
    [since]
  )
  return rows
}
