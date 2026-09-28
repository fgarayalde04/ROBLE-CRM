import { pool } from './pool'

export async function generateSolicitudId(clientNumber: string | null): Promise<string> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
  const dateStr = today.replace(/-/g, '')
  const prefix = clientNumber ? `${clientNumber}${dateStr}` : dateStr

  const params: any[] = [today + 'T00:00:00.000-03:00', today + 'T23:59:59.999-03:00']
  let where = `created_at >= $1 and created_at <= $2`
  if (clientNumber) { params.push(clientNumber); where += ` and client_number = $${params.length}` }

  const { rows } = await pool.query(`select count(*) from solicitudes where ${where}`, params)
  const count = parseInt(rows[0].count, 10)
  return `${prefix}.${String(count + 1).padStart(3, '0')}`
}

const LIST_COLUMNS = `
  id, solicitud_id, asesor, estado, canal, opera_asesor, ingresada_por, tipo_operacion,
  instrumento_tipo, instrumento_nombre, clase, moneda, monto, cantidad,
  fecha_operacion, client_name, client_number, client_email,
  precio_tipo, precio_limite, vigencia,
  operador, tomado_at, mail_enviado_at, ejecutado_at,
  created_at, updated_at, cc_emails, additional_emails, assets_json,
  aprobacion_cliente, aprobacion_comentario, aprobacion_at
`

export interface ListSolicitudesFilters {
  asesorFilter?: string | null // forced filter for non-mesa users
  asesor?: string | null // optional admin-picked filter
  estado?: string | null
  q?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  limit: number
  page: number
}

export async function listSolicitudes(filters: ListSolicitudesFilters) {
  const where: string[] = []
  const params: any[] = []

  if (filters.asesorFilter) { params.push(filters.asesorFilter); where.push(`asesor = $${params.length}`) }
  if (filters.asesor) { params.push(filters.asesor); where.push(`asesor = $${params.length}`) }
  if (filters.estado) { params.push(filters.estado); where.push(`estado = $${params.length}`) }
  if (filters.dateFrom) { params.push(filters.dateFrom + 'T00:00:00.000-03:00'); where.push(`created_at >= $${params.length}`) }
  if (filters.dateTo) { params.push(filters.dateTo + 'T23:59:59.999-03:00'); where.push(`created_at <= $${params.length}`) }
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(client_name ilike $${params.length} or client_number ilike $${params.length} or instrumento_nombre ilike $${params.length} or solicitud_id ilike $${params.length})`)
  }

  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const limit = filters.limit
  const offset = filters.page * filters.limit

  const [{ rows }, { rows: countRows }, { rows: estadoRows }] = await Promise.all([
    pool.query(
      `select ${LIST_COLUMNS} from solicitudes ${whereClause} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`select count(*) from solicitudes ${whereClause}`, params),
    // Conteo por estado exacto sobre todo el filtro (no solo la página cargada).
    pool.query(`select estado, count(*) from solicitudes ${whereClause} group by estado`, params),
  ])

  const countsByEstado: Record<string, number> = {}
  for (const r of estadoRows) countsByEstado[r.estado] = parseInt(r.count, 10)

  return { data: rows, total: parseInt(countRows[0].count, 10), countsByEstado }
}

// Órdenes propias que ya se enviaron pero todavía no se ejecutaron ni
// cancelaron — para mostrar en "Mi trabajo" del dashboard.
export async function getMyPendingSolicitudes(asesor: string, limit: number) {
  const { rows } = await pool.query(
    `select id, solicitud_id, estado, tipo_operacion, instrumento_nombre, monto, cantidad, client_name, created_at
     from solicitudes
     where asesor = $1 and estado not in ('ejecutada', 'cancelada')
     order by created_at desc
     limit $2`,
    [asesor, limit]
  )
  return rows
}

export async function createSolicitud(insert: Record<string, any>) {
  const entries = Object.entries(insert).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into solicitudes (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function insertSolicitudEvento(evento: Record<string, any>) {
  const entries = Object.entries(evento).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map(([k], i) => (k === 'datos' ? `$${i + 1}::jsonb` : `$${i + 1}`))
  const values = entries.map(([k, v]) => (k === 'datos' ? JSON.stringify(v) : v))
  await pool.query(
    `insert into solicitud_eventos (${cols.join(', ')}) values (${placeholders.join(', ')})`,
    values
  )
}

export async function getSolicitud(id: string) {
  const { rows } = await pool.query(`select * from solicitudes where id = $1`, [id])
  return rows[0] ?? null
}

// ── Aprobación del cliente desde el mail ──────────────────────────────────────
// Cada mail de orden lleva una referencia corta (aprobacion_token) en los
// botones Apruebo / No apruebo: la respuesta que arman es un mail nuevo (no
// queda en el mismo hilo), así que la referencia es lo que la vincula a la orden.

// Devuelve la referencia de la orden, creándola si todavía no tiene. Si Mesa
// reenvía el mail, sigue siendo la misma.
export async function ensureAprobacionToken(id: string, newToken: string): Promise<string | null> {
  const { rows } = await pool.query(
    `update solicitudes set aprobacion_token = coalesce(aprobacion_token, $2) where id = $1 returning aprobacion_token`,
    [id, newToken]
  )
  return rows[0]?.aprobacion_token ?? null
}

export async function findSolicitudByAprobacionToken(token: string) {
  const { rows } = await pool.query(
    `select id, client_name, asesor, asesor_id, mail_asunto from solicitudes where aprobacion_token = $1 limit 1`,
    [token]
  )
  return rows[0] ?? null
}

// Estados en los que la respuesta del cliente mueve el estado de la orden. Si
// Mesa ya la puso en ejecución (o terminó), la respuesta se guarda y se avisa,
// pero el estado no retrocede.
const ESTADOS_ESPERANDO_CLIENTE = ['mail_enviado', 'aprobada_cliente', 'rechazada_cliente']

// Gana la última respuesta: si el cliente cambia de opinión, se actualiza.
export async function registrarRespuestaCliente(id: string, decision: 'aprobada' | 'rechazada', comentario: string | null) {
  const nuevoEstado = decision === 'aprobada' ? 'aprobada_cliente' : 'rechazada_cliente'
  const { rows } = await pool.query(
    `update solicitudes
        set aprobacion_cliente = $2, aprobacion_comentario = $3, aprobacion_at = now(), updated_at = now(),
            estado = case when estado = any($4::text[]) then $5 else estado end
      where id = $1
      returning estado`,
    [id, decision, comentario, ESTADOS_ESPERANDO_CLIENTE, nuevoEstado]
  )
  return rows[0] ? { estado: rows[0].estado as string, cambioEstado: rows[0].estado === nuevoEstado } : null
}

export async function getSolicitudEventos(solicitudId: string) {
  const { rows } = await pool.query(
    `select id, tipo, descripcion, usuario, datos, created_at from solicitud_eventos where solicitud_id = $1 order by created_at asc`,
    [solicitudId]
  )
  return rows
}

// Para la detección de respuestas de cliente — busca la orden cuyo hilo de
// Gmail coincide exactamente. Es la señal fuerte: no depende de desde qué
// dirección responda el cliente, solo de que sea "Responder" dentro del
// mismo hilo.
export async function findSolicitudByThreadId(threadId: string) {
  const { rows } = await pool.query(
    `select id, client_name, asesor, asesor_id, mail_asunto from solicitudes where mail_thread_id = $1 limit 1`,
    [threadId]
  )
  return rows[0] ?? null
}

// Respaldo para órdenes sin mail_thread_id guardado: matchea por asunto exacto
// — el llamador solo lo usa como match si devuelve exactamente una fila
// (inequívoco); si hay más de una o ninguna, no se adivina.
export async function findSolicitudesByAsunto(asunto: string) {
  const { rows } = await pool.query(
    `select id, client_name, asesor, asesor_id from solicitudes where mail_asunto = $1`,
    [asunto]
  )
  return rows
}

export async function updateSolicitud(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update solicitudes set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}
