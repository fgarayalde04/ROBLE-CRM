import { pool } from './pool'

export async function generateOrdenId(clientNumber: string | null): Promise<string> {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const datePfx = dateStr.replace(/-/g, '')
  const prefix = clientNumber ? `${clientNumber}${datePfx}` : datePfx

  const params: any[] = [dateStr + 'T00:00:00.000Z', dateStr + 'T23:59:59.999Z']
  let where = `created_at >= $1 and created_at <= $2`
  if (clientNumber) { params.push(clientNumber); where += ` and client_number = $${params.length}` }

  const { rows } = await pool.query(`select count(*) from order_history where ${where}`, params)
  const seq = String(parseInt(rows[0].count, 10) + 1).padStart(3, '0')
  return `${prefix}.${seq}`
}

export interface ListOrderHistoryFilters {
  userFilter?: string | null // forced filter for non-admin
  user?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  q?: string | null
}

const ORDER_HISTORY_LIST_COLUMNS = `
  id, orden_id, user_name, client_name, client_number,
  to_email, subject, status, order_count, instruments,
  confirmacion_cliente, orden_ejecutada, comentarios, summary_text,
  created_at, sent_at
`

export async function listOrderHistory(filters: ListOrderHistoryFilters) {
  const where: string[] = []
  const params: any[] = []
  if (filters.userFilter) { params.push(filters.userFilter); where.push(`user_name = $${params.length}`) }
  else if (filters.user) { params.push(filters.user); where.push(`user_name = $${params.length}`) }
  if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`created_at >= $${params.length}`) }
  if (filters.dateTo) { params.push(filters.dateTo + 'T23:59:59.999Z'); where.push(`created_at <= $${params.length}`) }
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(client_name ilike $${params.length} or client_number ilike $${params.length} or to_email ilike $${params.length} or orden_id ilike $${params.length})`)
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select ${ORDER_HISTORY_LIST_COLUMNS} from order_history ${whereClause} order by created_at desc limit 500`,
    params
  )
  return rows
}

export async function createOrderHistory(insert: Record<string, any>) {
  const entries = Object.entries(insert).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into order_history (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function insertOrderHistoryItems(items: Record<string, any>[]) {
  if (items.length === 0) return
  const cols = Object.keys(items[0])
  const values: any[] = []
  const rowsSql = items.map((item, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(item[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  await pool.query(
    `insert into order_history_items (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}`,
    values
  )
}

export async function getOrderHistoryEntry(id: string) {
  const { rows } = await pool.query(`select * from order_history where id = $1`, [id])
  return rows[0] ?? null
}

export async function getOrderHistoryItems(orderId: string) {
  const { rows } = await pool.query(
    `select * from order_history_items where order_id = $1 order by created_at asc`,
    [orderId]
  )
  return rows
}

export async function deleteOrderHistoryEntry(id: string) {
  await pool.query(`delete from order_history_items where order_id = $1`, [id])
  await pool.query(`delete from order_history where id = $1`, [id])
}

export async function updateOrderHistoryEntry(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update order_history set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

// ─── Items view (todo list) ─────────────────────────────────────────────────

export interface ListItemsFilters {
  userFilter?: string | null
  user?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  done?: 'true' | 'false' | null
  instrument?: string | null
}

export async function listOrderItemsFlat(filters: ListItemsFilters) {
  const orderWhere: string[] = []
  const orderParams: any[] = []
  if (filters.userFilter) { orderParams.push(filters.userFilter); orderWhere.push(`user_name = $${orderParams.length}`) }
  else if (filters.user) { orderParams.push(filters.user); orderWhere.push(`user_name = $${orderParams.length}`) }
  if (filters.dateFrom) { orderParams.push(filters.dateFrom); orderWhere.push(`created_at >= $${orderParams.length}`) }
  if (filters.dateTo) { orderParams.push(filters.dateTo + 'T23:59:59.999Z'); orderWhere.push(`created_at <= $${orderParams.length}`) }

  const orderWhereClause = orderWhere.length > 0 ? `where ${orderWhere.join(' and ')}` : ''
  const { rows: orders } = await pool.query(
    `select id, user_name, client_name, client_number, created_at, status from order_history ${orderWhereClause} order by created_at desc limit 500`,
    orderParams
  )
  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const orderMap = new Map(orders.map((o) => [o.id, o]))

  const itemWhere: string[] = [`order_id = ANY($1)`]
  const itemParams: any[] = [orderIds]
  if (filters.done === 'true') itemWhere.push(`done = true`)
  if (filters.done === 'false') itemWhere.push(`(done is null or done = false)`)
  if (filters.instrument) { itemParams.push(filters.instrument); itemWhere.push(`order_type = $${itemParams.length}`) }

  const { rows: items } = await pool.query(
    `select id, order_id, order_type, operation_type, instrument_name, symbol, cusip, quantity, value_amount, moneda, done, done_by, done_at
     from order_history_items where ${itemWhere.join(' and ')}`,
    itemParams
  )

  const flat = items.map((item) => {
    const order = orderMap.get(item.order_id)!
    return {
      id: item.id, order_id: item.order_id, order_type: item.order_type, operation_type: item.operation_type,
      instrument_name: item.instrument_name, symbol: item.symbol, cusip: item.cusip,
      quantity: item.quantity, value_amount: item.value_amount, moneda: item.moneda,
      done: item.done ?? false, done_by: item.done_by, done_at: item.done_at,
      client_name: order.client_name, client_number: order.client_number, user_name: order.user_name,
      order_created_at: order.created_at, order_status: order.status,
    }
  })
  flat.sort((a, b) => new Date(b.order_created_at).getTime() - new Date(a.order_created_at).getTime())
  return flat
}

export async function getOrderItemOwner(itemId: string) {
  const { rows } = await pool.query(`select order_id from order_history_items where id = $1`, [itemId])
  if (rows.length === 0) return null
  const orderId = rows[0].order_id
  const { rows: orderRows } = await pool.query(`select user_name from order_history where id = $1`, [orderId])
  return { orderId, userName: orderRows[0]?.user_name ?? null }
}

export async function updateOrderItemDone(id: string, done: boolean, userName: string) {
  const { rows } = await pool.query(
    `update order_history_items set done = $1, done_by = $2, done_at = $3 where id = $4
     returning id, done, done_by, done_at`,
    [done, done ? userName : null, done ? new Date().toISOString() : null, id]
  )
  return rows[0] ?? null
}

// ─── Blotter ─────────────────────────────────────────────────────────────────

export interface BlotterFilters {
  userFilter?: string | null
  asesor?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  q?: string | null
  soloHoy?: boolean
  estado?: string | null
  tipo?: string | null
  operacion?: string | null
  vigencia?: string | null
}

const BLOTTER_ITEM_COLUMNS = `
  id, order_id, order_type, operation_type,
  instrument_name, symbol, cusip, quantity, price, moneda,
  vigencia, order_date, notes, cupon, maturity,
  mail_respondido, mail_respondido_at, mail_respondido_by,
  done, precio_ejecutado, valor_efectivo,
  ejecutado_at, ejecutado_by,
  en_mercado_at, en_mercado_by,
  cancelado_at, cancelado_by, cancelado_motivo,
  estado, created_at
`

export async function getBlotterRows(filters: BlotterFilters) {
  const orderWhere: string[] = []
  const orderParams: any[] = []
  if (filters.userFilter) { orderParams.push(filters.userFilter); orderWhere.push(`user_name = $${orderParams.length}`) }
  else if (filters.asesor) { orderParams.push(filters.asesor); orderWhere.push(`user_name = $${orderParams.length}`) }

  if (filters.soloHoy) {
    const today = new Date().toISOString().split('T')[0]
    orderParams.push(today + 'T00:00:00.000Z')
    orderWhere.push(`created_at >= $${orderParams.length}`)
  } else {
    if (filters.dateFrom) { orderParams.push(filters.dateFrom + 'T00:00:00.000Z'); orderWhere.push(`created_at >= $${orderParams.length}`) }
    if (filters.dateTo) { orderParams.push(filters.dateTo + 'T23:59:59.999Z'); orderWhere.push(`created_at <= $${orderParams.length}`) }
  }
  if (filters.q) {
    orderParams.push(`%${filters.q}%`)
    orderWhere.push(`(client_name ilike $${orderParams.length} or client_number ilike $${orderParams.length} or orden_id ilike $${orderParams.length})`)
  }

  const orderWhereClause = orderWhere.length > 0 ? `where ${orderWhere.join(' and ')}` : ''
  const { rows: orders } = await pool.query(
    `select id, orden_id, user_name, user_id, client_name, client_number, created_at
     from order_history ${orderWhereClause} order by created_at desc limit 1000`,
    orderParams
  )
  if (orders.length === 0) return { rows: [], kpis: emptyKpis() }

  const orderIds = orders.map((o) => o.id)
  const orderMap = new Map(orders.map((o) => [o.id, o]))

  const itemWhere: string[] = [`order_id = ANY($1)`]
  const itemParams: any[] = [orderIds]
  if (filters.estado) { itemParams.push(filters.estado); itemWhere.push(`estado = $${itemParams.length}`) }
  if (filters.tipo) { itemParams.push(filters.tipo); itemWhere.push(`order_type = $${itemParams.length}`) }
  if (filters.operacion) { itemParams.push(filters.operacion); itemWhere.push(`operation_type = $${itemParams.length}`) }
  if (filters.vigencia) { itemParams.push(filters.vigencia); itemWhere.push(`vigencia = $${itemParams.length}`) }

  const { rows: items } = await pool.query(
    `select ${BLOTTER_ITEM_COLUMNS} from order_history_items where ${itemWhere.join(' and ')} order by created_at desc`,
    itemParams
  )

  const rows = items.map((item) => {
    const parent = orderMap.get(item.order_id)!
    return {
      id: item.id, order_id: item.order_id, order_type: item.order_type, operation_type: item.operation_type,
      instrument_name: item.instrument_name, symbol: item.symbol, cusip: item.cusip,
      quantity: item.quantity, price: item.price, moneda: item.moneda,
      vigencia: item.vigencia, order_date: item.order_date, notes: item.notes, cupon: item.cupon, maturity: item.maturity,
      mail_respondido: item.mail_respondido ?? false, mail_respondido_at: item.mail_respondido_at, mail_respondido_by: item.mail_respondido_by,
      done: item.done ?? false, precio_ejecutado: item.precio_ejecutado, valor_efectivo: item.valor_efectivo,
      ejecutado_at: item.ejecutado_at, ejecutado_by: item.ejecutado_by,
      en_mercado_at: item.en_mercado_at, en_mercado_by: item.en_mercado_by,
      cancelado_at: item.cancelado_at, cancelado_by: item.cancelado_by, cancelado_motivo: item.cancelado_motivo,
      estado: item.estado ?? 'pendiente_autorizacion', item_created_at: item.created_at,
      orden_id: parent.orden_id, user_name: parent.user_name, user_id: parent.user_id,
      client_name: parent.client_name, client_number: parent.client_number, order_created_at: parent.created_at,
    }
  })

  const today = new Date().toISOString().split('T')[0]
  const { rows: todayItems } = await pool.query(
    `select estado, mail_respondido, done, cancelado_at, created_at from order_history_items where created_at >= $1`,
    [today + 'T00:00:00.000Z']
  )
  const kpis = {
    recibidas_hoy: todayItems.length,
    pendientes_autorizacion: todayItems.filter((i) => i.estado === 'pendiente_autorizacion').length,
    pendientes_ejecutar: todayItems.filter((i) => i.estado === 'autorizada' || i.estado === 'en_mercado').length,
    ejecutadas_hoy: todayItems.filter((i) => i.estado === 'ejecutada').length,
    canceladas: todayItems.filter((i) => i.estado === 'cancelada').length,
  }

  return { rows, kpis }
}

function emptyKpis() {
  return { recibidas_hoy: 0, pendientes_autorizacion: 0, pendientes_ejecutar: 0, ejecutadas_hoy: 0, canceladas: 0 }
}

export async function getBlotterItem(id: string) {
  const { rows } = await pool.query(
    `select id, order_id, mail_respondido, done, en_mercado_at, cancelado_at, vigencia, order_date, estado
     from order_history_items where id = $1`,
    [id]
  )
  return rows[0] ?? null
}

export async function getOrderHistoryParent(orderId: string) {
  const { rows } = await pool.query(
    `select id, user_name, orden_id, client_name from order_history where id = $1`,
    [orderId]
  )
  return rows[0] ?? null
}

export async function updateBlotterItem(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update order_history_items set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function insertOrderEvento(evento: Record<string, any>) {
  const entries = Object.entries(evento).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map(([k], i) => (k === 'datos' ? `$${i + 1}::jsonb` : `$${i + 1}`))
  const values = entries.map(([k, v]) => (k === 'datos' ? JSON.stringify(v) : v))
  await pool.query(
    `insert into order_eventos (${cols.join(', ')}) values (${placeholders.join(', ')})`,
    values
  )
}

export async function getOrderEventos(itemId: string) {
  const { rows } = await pool.query(
    `select id, tipo, descripcion, usuario, datos, created_at from order_eventos where item_id = $1 order by created_at asc`,
    [itemId]
  )
  return rows
}
