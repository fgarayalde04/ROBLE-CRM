import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// Generate YYYYMMDD.XXX orden_id (resets each day)
async function generateOrdenId(): Promise<string> {
  const now   = new Date()
  const dateStr = now.toISOString().split('T')[0]               // "2026-06-09"
  const prefix  = dateStr.replace(/-/g, '')                     // "20260609"

  const { count } = await supabaseAdmin
    .from('order_history')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', dateStr + 'T00:00:00.000Z')
    .lte('created_at', dateStr + 'T23:59:59.999Z')

  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return `${prefix}.${seq}`
}

// Build one-line summary from blocks  e.g. "Compra AAPL, Venta Bono YPF, Compra Fondo BLK"
function buildSummary(blocks: any[]): string {
  return blocks.slice(0, 5).map((b: any) => {
    const op   = b.operacion === 'compra' ? 'Compra' : 'Venta'
    const name = b.type === 'acciones' ? (b.ticker || b.nombre || 'Acción')
               : b.type === 'fondos'   ? (b.fondo   || 'Fondo')
               :                         (b.descripcion || 'Bono')
    return `${op} ${name}`
  }).join(', ') + (blocks.length > 5 ? ` (+${blocks.length - 5} más)` : '')
}

// GET /api/ordenes — one row per email, with summary
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q')?.trim()
  const dateFrom   = searchParams.get('dateFrom')
  const dateTo     = searchParams.get('dateTo')
  const userFilter = isAdmin ? searchParams.get('user') : null

  let query = supabaseAdmin
    .from('order_history')
    .select(`
      id, orden_id, user_name, client_name, client_number,
      to_email, subject, status, order_count, instruments,
      confirmacion_cliente, orden_ejecutada, comentarios, summary_text,
      created_at, sent_at
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!isAdmin)       query = query.eq('user_name', session.name)
  else if (userFilter) query = query.eq('user_name', userFilter)

  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
  if (q)        query = query.or(
    `client_name.ilike.%${q}%,client_number.ilike.%${q}%,to_email.ilike.%${q}%,orden_id.ilike.%${q}%`
  )

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data ?? [], isAdmin })
}

// POST /api/ordenes — save order + items
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body   = await req.json()
  const blocks = body.blocks as any[] | undefined

  const ordenId    = await generateOrdenId()
  const summaryTxt = Array.isArray(blocks) && blocks.length > 0 ? buildSummary(blocks) : null

  // ── 1. Save main order record ───────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('order_history')
    .insert({
      orden_id:      ordenId,
      summary_text:  summaryTxt,
      user_name:     session.name       ?? null,
      user_id:       session.id         ?? null,
      client_name:   body.client_name   ?? null,
      client_number: body.client_number ?? null,
      client_id:     null,
      to_email:      body.to_email      ?? null,
      subject:       body.subject       ?? null,
      body:          body.body          ?? null,
      status:        body.status        ?? 'copiado',
      order_count:   body.order_count   ?? 0,
      instruments:   body.instruments   ?? [],
      sent_at:       body.status === 'enviado' ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    console.error('[ORDER_HISTORY_ERROR]', error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  console.log('[ORDER_HISTORY_CREATED]', data.orden_id, '| id:', data.id, '| user:', session.name)

  // ── 2. Save individual items ────────────────────────────────────────────────
  if (data && Array.isArray(blocks) && blocks.length > 0) {
    const items = blocks.map((block: any) => ({
      order_id:        data.id,
      order_type:      block.type,
      operation_type:  block.operacion,
      instrument_name:
        block.type === 'acciones' ? (block.nombre      || null)
        : block.type === 'fondos' ? (block.fondo       || null)
        :                           (block.descripcion  || null),
      symbol:       block.type === 'acciones' ? (block.ticker    || null) : null,
      cusip:        block.type !== 'acciones'  ? (block.cusipIsin || null) : null,
      quantity:     block.type === 'fondos'    ? (block.monto     || null) : (block.cantidad || null),
      value_amount: block.type === 'fondos'    ? (block.monto     || null) : null,
      price:        block.precio === 'limite'  ? (block.precioLimite || null) : 'mercado',
      moneda:       block.moneda  || null,
      order_date:   block.fecha   || null,
      notes:        block.observaciones?.trim() || null,
      vigencia:     block.vigencia || 'DIA',
      comision:     block.comision?.trim() || null,
    }))

    const { error: itemsError } = await supabaseAdmin
      .from('order_history_items').insert(items)

    if (itemsError) {
      if (itemsError.message.includes('vigencia') || itemsError.message.includes('comision')) {
        const safeItems = items.map(({ vigencia: _v, comision: _c, ...rest }: any) => rest)
        const { error: fe } = await supabaseAdmin.from('order_history_items').insert(safeItems)
        if (fe) console.error('[ORDER_ITEM_ERROR]', fe.message)
        else    console.log('[ORDER_ITEM_CREATED]', safeItems.length, 'items (migration pending)')
      } else {
        console.error('[ORDER_ITEM_ERROR]', itemsError.message)
      }
    } else {
      console.log('[ORDER_ITEM_CREATED]', items.length, 'items for', data.orden_id)
    }
  }

  return NextResponse.json({ ok: true, order_id: data.id, orden_id: data.orden_id, status: data.status })
}
