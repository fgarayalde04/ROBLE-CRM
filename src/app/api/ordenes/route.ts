import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateOrdenId, listOrderHistory, createOrderHistory, insertOrderHistoryItems } from '@/lib/db/ordenes'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

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

  const data = await listOrderHistory({
    userFilter: !isAdmin ? session.name : null,
    user: userFilter, dateFrom, dateTo, q,
  })

  return NextResponse.json({ entries: data, isAdmin })
}

// POST /api/ordenes — save order + items
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body   = await req.json()
  const blocks = body.blocks as any[] | undefined

  const ordenId    = await generateOrdenId(body.client_number ?? null)
  const summaryTxt = Array.isArray(blocks) && blocks.length > 0 ? buildSummary(blocks) : null

  // ── 1. Save main order record ───────────────────────────────────────────────
  let data
  try {
    data = await createOrderHistory({
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
  } catch (err: any) {
    console.error('[ORDER_HISTORY_ERROR]', err.message)
    return NextResponse.json({ error: err.message }, { status: 400 })
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
      maturity:     block.type === 'bonos' ? (block.maturity?.trim() || null) : null,
      cupon:        block.type === 'bonos' ? (block.cupon?.trim()    || null) : null,
    }))

    try {
      await insertOrderHistoryItems(items)
      console.log('[ORDER_ITEM_CREATED]', items.length, 'items for', data.orden_id)
    } catch (itemsError: any) {
      if (itemsError.message?.includes('vigencia') || itemsError.message?.includes('comision')) {
        const safeItems = items.map(({ vigencia: _v, comision: _c, ...rest }: any) => rest)
        try {
          await insertOrderHistoryItems(safeItems)
          console.log('[ORDER_ITEM_CREATED]', safeItems.length, 'items (migration pending)')
        } catch (fe: any) {
          console.error('[ORDER_ITEM_ERROR]', fe.message)
        }
      } else {
        console.error('[ORDER_ITEM_ERROR]', itemsError.message)
      }
    }
  }

  return NextResponse.json({ ok: true, order_id: data.id, orden_id: data.orden_id, status: data.status })
}
