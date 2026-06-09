import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

export interface FlatItem {
  id: string
  order_id: string
  order_type: string
  operation_type: string
  instrument_name: string | null
  symbol: string | null
  cusip: string | null
  quantity: string | null
  value_amount: string | null
  moneda: string | null
  done: boolean
  done_by: string | null
  done_at: string | null
  // from order_history
  client_name: string | null
  client_number: string | null
  user_name: string | null
  order_created_at: string
  order_status: string
}

// GET /api/ordenes/items
// Params: done (true|false|empty=all), dateFrom, dateTo, instrument, user (admin)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { searchParams } = req.nextUrl

  const doneParam   = searchParams.get('done')       // 'true' | 'false' | null
  const dateFrom    = searchParams.get('dateFrom')
  const dateTo      = searchParams.get('dateTo')
  const instrument  = searchParams.get('instrument')
  const userFilter  = isAdmin ? searchParams.get('user') : null

  // ── Step 1: fetch matching orders (date + user scoping) ──
  let orderQuery = supabaseAdmin
    .from('order_history')
    .select('id, user_name, client_name, client_number, created_at, status')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!isAdmin) {
    orderQuery = orderQuery.eq('user_name', session.name)
  } else if (userFilter) {
    orderQuery = orderQuery.eq('user_name', userFilter)
  }
  if (dateFrom) orderQuery = orderQuery.gte('created_at', dateFrom)
  if (dateTo)   orderQuery = orderQuery.lte('created_at', dateTo + 'T23:59:59.999Z')

  const { data: orders, error: ordersErr } = await orderQuery
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 })
  if (!orders || orders.length === 0) return NextResponse.json({ items: [] })

  const orderIds = orders.map((o) => o.id)
  const orderMap = new Map(orders.map((o) => [o.id, o]))

  // ── Step 2: fetch items for those orders ──
  let itemQuery = supabaseAdmin
    .from('order_history_items')
    .select('id, order_id, order_type, operation_type, instrument_name, symbol, cusip, quantity, value_amount, moneda, done, done_by, done_at')
    .in('order_id', orderIds)

  if (doneParam === 'true')  itemQuery = itemQuery.eq('done', true)
  if (doneParam === 'false') itemQuery = itemQuery.or('done.is.null,done.eq.false')
  if (instrument)            itemQuery = itemQuery.eq('order_type', instrument)

  const { data: items, error: itemsErr } = await itemQuery
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  // ── Step 3: merge into flat rows ──
  const flat: FlatItem[] = (items ?? []).map((item) => {
    const order = orderMap.get(item.order_id)!
    return {
      id:               item.id,
      order_id:         item.order_id,
      order_type:       item.order_type,
      operation_type:   item.operation_type,
      instrument_name:  item.instrument_name,
      symbol:           item.symbol,
      cusip:            item.cusip,
      quantity:         item.quantity,
      value_amount:     item.value_amount,
      moneda:           item.moneda,
      done:             item.done ?? false,
      done_by:          item.done_by,
      done_at:          item.done_at,
      client_name:      order.client_name,
      client_number:    order.client_number,
      user_name:        order.user_name,
      order_created_at: order.created_at,
      order_status:     order.status,
    }
  })

  // Sort by order date desc, then by item creation within same order
  flat.sort((a, b) => new Date(b.order_created_at).getTime() - new Date(a.order_created_at).getTime())

  return NextResponse.json({ items: flat, isAdmin })
}
