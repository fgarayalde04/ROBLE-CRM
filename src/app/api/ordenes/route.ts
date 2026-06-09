import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/ordenes — permission-scoped
// Query params: q, status, dateFrom, dateTo, instrument, user (admin only)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q')?.trim()
  const status     = searchParams.get('status')
  const dateFrom   = searchParams.get('dateFrom')
  const dateTo     = searchParams.get('dateTo')
  const instrument = searchParams.get('instrument')
  const userFilter = isAdmin ? searchParams.get('user') : null

  let query = supabaseAdmin
    .from('order_history')
    .select('id, user_name, user_id, client_name, client_number, to_email, subject, status, order_count, instruments, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(500)

  // ── Permission scope (enforced server-side) ──
  if (!isAdmin) {
    query = query.eq('user_name', session.name)
  } else if (userFilter) {
    query = query.eq('user_name', userFilter)
  }

  // ── Filters ──
  if (status)   query = query.eq('status', status)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
  if (instrument) query = (query as any).contains('instruments', [instrument])

  // Text search (client name or number)
  if (q) {
    query = query.or(`client_name.ilike.%${q}%,client_number.ilike.%${q}%,to_email.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data ?? [], isAdmin })
}

// POST /api/ordenes — save order + items
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  // Save main order
  const { data, error } = await supabaseAdmin
    .from('order_history')
    .insert({
      user_name:    session.name ?? null,
      user_id:      session.id  ?? null,
      client_name:  body.client_name   ?? null,
      client_number: body.client_number ?? null,
      client_id:    body.client_id     ?? null,
      to_email:     body.to_email      ?? null,
      subject:      body.subject       ?? null,
      body:         body.body          ?? null,
      status:       body.status        ?? 'copiado',
      order_count:  body.order_count   ?? 0,
      instruments:  body.instruments   ?? [],
      sent_at:      body.status === 'enviado' ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Save individual order blocks as items
  const blocks = body.blocks as any[] | undefined
  if (data && Array.isArray(blocks) && blocks.length > 0) {
    const items = blocks.map((block: any) => ({
      order_id:       data.id,
      order_type:     block.type,
      operation_type: block.operacion,
      instrument_name:
        block.type === 'acciones' ? (block.nombre   || null)
        : block.type === 'fondos' ? (block.fondo    || null)
        :                           (block.descripcion || null),
      symbol:       block.type === 'acciones' ? (block.ticker   || null) : null,
      cusip:        block.type !== 'acciones'  ? (block.cusipIsin || null) : null,
      quantity:     block.type === 'fondos'    ? (block.monto    || null) : (block.cantidad || null),
      value_amount: block.type === 'fondos'    ? (block.monto    || null) : null,
      price:        block.precio === 'limite'  ? (block.precioLimite || null) : 'mercado',
      moneda:       block.moneda  || null,
      order_date:   block.fecha   || null,
      notes:        block.observaciones?.trim() || null,
    }))
    await supabaseAdmin.from('order_history_items').insert(items)
  }

  return NextResponse.json(data)
}
