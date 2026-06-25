import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

export interface BlotterRow {
  // item fields
  id: string
  order_id: string
  order_type: string
  operation_type: string
  instrument_name: string | null
  symbol: string | null
  cusip: string | null
  quantity: string | null
  price: string | null
  moneda: string | null
  vigencia: string | null
  order_date: string | null
  notes: string | null
  cupon: string | null
  maturity: string | null
  mail_respondido: boolean
  mail_respondido_at: string | null
  mail_respondido_by: string | null
  done: boolean
  precio_ejecutado: number | null
  valor_efectivo: number | null
  ejecutado_at: string | null
  ejecutado_by: string | null
  en_mercado_at: string | null
  en_mercado_by: string | null
  cancelado_at: string | null
  cancelado_by: string | null
  cancelado_motivo: string | null
  estado: string
  item_created_at: string
  // parent fields
  orden_id: string
  user_name: string | null
  user_id: string | null
  client_name: string | null
  client_number: string | null
  order_created_at: string
}

// GET /api/ordenes/blotter
// Params: dateFrom, dateTo, asesor, estado, tipo, operacion, q, vigencia
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const sp = req.nextUrl.searchParams

  const dateFrom  = sp.get('dateFrom')
  const dateTo    = sp.get('dateTo')
  const asesor    = isAdmin ? sp.get('asesor') : null
  const estado    = sp.get('estado')
  const tipo      = sp.get('tipo')
  const operacion = sp.get('operacion')
  const vigencia  = sp.get('vigencia')
  const q         = sp.get('q')?.trim()
  const soloHoy   = sp.get('hoy') === '1'

  // ── 1. Fetch orders ──────────────────────────────────────────────
  let orderQ = supabaseAdmin
    .from('order_history')
    .select('id, orden_id, user_name, user_id, client_name, client_number, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!isAdmin) {
    orderQ = orderQ.eq('user_name', session.name)
  } else if (asesor) {
    orderQ = orderQ.eq('user_name', asesor)
  }

  if (soloHoy) {
    const today = new Date().toISOString().split('T')[0]
    orderQ = orderQ.gte('created_at', today + 'T00:00:00.000Z')
  } else {
    if (dateFrom) orderQ = orderQ.gte('created_at', dateFrom + 'T00:00:00.000Z')
    if (dateTo)   orderQ = orderQ.lte('created_at', dateTo   + 'T23:59:59.999Z')
  }

  if (q) {
    orderQ = orderQ.or(
      `client_name.ilike.%${q}%,client_number.ilike.%${q}%,orden_id.ilike.%${q}%`
    )
  }

  const { data: orders, error: ordErr } = await orderQ
  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 })
  if (!orders || orders.length === 0) return NextResponse.json({ rows: [], isAdmin })

  const orderIds = orders.map(o => o.id)
  const orderMap = new Map(orders.map(o => [o.id, o]))

  // ── 2. Fetch items ────────────────────────────────────────────────
  let itemQ = supabaseAdmin
    .from('order_history_items')
    .select(`
      id, order_id, order_type, operation_type,
      instrument_name, symbol, cusip, quantity, price, moneda,
      vigencia, order_date, notes, cupon, maturity,
      mail_respondido, mail_respondido_at, mail_respondido_by,
      done, precio_ejecutado, valor_efectivo,
      ejecutado_at, ejecutado_by,
      en_mercado_at, en_mercado_by,
      cancelado_at, cancelado_by, cancelado_motivo,
      estado, created_at
    `)
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })

  if (estado)    itemQ = itemQ.eq('estado', estado)
  if (tipo)      itemQ = itemQ.eq('order_type', tipo)
  if (operacion) itemQ = itemQ.eq('operation_type', operacion)
  if (vigencia)  itemQ = itemQ.eq('vigencia', vigencia)

  const { data: items, error: itemErr } = await itemQ
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

  // ── 3. Merge ──────────────────────────────────────────────────────
  const rows: BlotterRow[] = (items ?? []).map(item => {
    const parent = orderMap.get(item.order_id)!
    return {
      id:                  item.id,
      order_id:            item.order_id,
      order_type:          item.order_type,
      operation_type:      item.operation_type,
      instrument_name:     item.instrument_name,
      symbol:              item.symbol,
      cusip:               item.cusip,
      quantity:            item.quantity,
      price:               item.price,
      moneda:              item.moneda,
      vigencia:            item.vigencia,
      order_date:          item.order_date,
      notes:               item.notes,
      cupon:               item.cupon,
      maturity:            item.maturity,
      mail_respondido:     item.mail_respondido ?? false,
      mail_respondido_at:  item.mail_respondido_at,
      mail_respondido_by:  item.mail_respondido_by,
      done:                item.done ?? false,
      precio_ejecutado:    item.precio_ejecutado,
      valor_efectivo:      item.valor_efectivo,
      ejecutado_at:        item.ejecutado_at,
      ejecutado_by:        item.ejecutado_by,
      en_mercado_at:       item.en_mercado_at,
      en_mercado_by:       item.en_mercado_by,
      cancelado_at:        item.cancelado_at,
      cancelado_by:        item.cancelado_by,
      cancelado_motivo:    item.cancelado_motivo,
      estado:              item.estado ?? 'pendiente_autorizacion',
      item_created_at:     item.created_at,
      orden_id:            parent.orden_id,
      user_name:           parent.user_name,
      user_id:             parent.user_id,
      client_name:         parent.client_name,
      client_number:       parent.client_number,
      order_created_at:    parent.created_at,
    }
  })

  // ── 4. KPIs ───────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const allTodayQ = await supabaseAdmin
    .from('order_history_items')
    .select('estado, mail_respondido, done, cancelado_at, created_at')
    .gte('created_at', today + 'T00:00:00.000Z')

  const todayItems = allTodayQ.data ?? []
  const kpis = {
    recibidas_hoy:           todayItems.length,
    pendientes_autorizacion: todayItems.filter(i => i.estado === 'pendiente_autorizacion').length,
    pendientes_ejecutar:     todayItems.filter(i => i.estado === 'autorizada' || i.estado === 'en_mercado').length,
    ejecutadas_hoy:          todayItems.filter(i => i.estado === 'ejecutada').length,
    canceladas:              todayItems.filter(i => i.estado === 'cancelada').length,
  }

  return NextResponse.json({ rows, isAdmin, kpis })
}
