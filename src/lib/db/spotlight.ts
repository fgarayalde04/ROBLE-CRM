import { pool } from './pool'

export async function spotlightSearch(q: string) {
  const like = `%${q}%`

  const [clientsRes, tasksRes, openingsRes, resourcesRes] = await Promise.all([
    pool.query(
      `select id, first_name, last_name, client_number, status from clients
       where first_name ilike $1 or last_name ilike $1 or client_number ilike $1
       limit 5`,
      [like]
    ),
    pool.query(
      `select id, title, status, priority, due_date from tasks
       where title ilike $1 and status <> 'completado'
       limit 4`,
      [like]
    ),
    pool.query(
      `select id, folder_name, status, advisor from account_openings where folder_name ilike $1 limit 3`,
      [like]
    ),
    pool.query(
      `select id, name, category, file_url from resources where name ilike $1 limit 3`,
      [like]
    ),
  ])

  return {
    clients: clientsRes.rows,
    tasks: tasksRes.rows,
    openings: openingsRes.rows,
    resources: resourcesRes.rows,
  }
}
