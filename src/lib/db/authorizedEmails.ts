import { pool } from './pool'

export async function listAuthorizedEmails(clientNumber: string | null) {
  const where = ['autorizado = true']
  const params: any[] = []
  if (clientNumber) { params.push(clientNumber); where.push(`numero_cliente = $${params.length}`) }
  const { rows } = await pool.query(
    `select id, email, nombre_cliente, fecha_autorizacion, ultima_utilizacion, cantidad_utilizaciones, autorizado
     from client_authorized_emails where ${where.join(' and ')} order by cantidad_utilizaciones desc`,
    params
  )
  return rows
}

export async function listOrderHistoryEmails(clientNumber: string | null, clientName: string | null) {
  const where = [`to_email is not null`, `to_email not ilike '%@roblecapital.net'`]
  const params: any[] = []
  if (clientNumber) { params.push(clientNumber); where.push(`client_number = $${params.length}`) }
  else if (clientName) { params.push(`%${clientName}%`); where.push(`client_name ilike $${params.length}`) }
  const { rows } = await pool.query(
    `select to_email from order_history where ${where.join(' and ')} order by created_at desc limit 100`,
    params
  )
  return rows
}

export async function upsertAuthorizedEmail(record: {
  numero_cliente: string | null
  nombre_cliente: string | null
  email: string
  autorizado: boolean
  fecha_autorizacion: string
  usuario_autorizo: string | null
}) {
  const { rows } = await pool.query(
    `insert into client_authorized_emails (numero_cliente, nombre_cliente, email, autorizado, fecha_autorizacion, usuario_autorizo)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (numero_cliente, email) do update set
       nombre_cliente = excluded.nombre_cliente,
       autorizado = excluded.autorizado,
       fecha_autorizacion = excluded.fecha_autorizacion,
       usuario_autorizo = excluded.usuario_autorizo
     returning *`,
    [record.numero_cliente, record.nombre_cliente, record.email, record.autorizado, record.fecha_autorizacion, record.usuario_autorizo]
  )
  return rows[0]
}

export async function findAuthorizedEmailForUse(email: string, numeroCliente: string | null) {
  const where = ['email = $1', 'autorizado = true']
  const params: any[] = [email]
  if (numeroCliente) { params.push(numeroCliente); where.push(`numero_cliente = $${params.length}`) }
  const { rows } = await pool.query(
    `select id, cantidad_utilizaciones from client_authorized_emails where ${where.join(' and ')} limit 1`,
    params
  )
  return rows[0] ?? null
}

export async function bumpAuthorizedEmailUsage(id: string, newCount: number) {
  await pool.query(
    `update client_authorized_emails set ultima_utilizacion = now(), cantidad_utilizaciones = $1 where id = $2`,
    [newCount, id]
  )
}
