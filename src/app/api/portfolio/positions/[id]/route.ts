import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

// PATCH /api/portfolio/positions/[id] — corrige a mano un dato puntual de una
// posición: la clase de activo (Morgan Stanley no trae security-type, así que
// el heurístico automático a veces deja "Sin clasificar"), la fecha de
// compra (el custodio a veces no la trae, o viene mal en el import), o el
// interés/dividendo recibido de un fondo (no viene en ningún import).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { asset_class?: string; purchase_date?: string | null; manual_dividend_received?: number | null }
  const sets: string[] = []
  const values: unknown[] = []

  if (body.asset_class !== undefined) {
    const assetClass = body.asset_class?.trim()
    if (!assetClass) return NextResponse.json({ error: 'asset_class no puede quedar vacío' }, { status: 400 })
    values.push(assetClass)
    sets.push(`asset_class = $${values.length}`)
  }
  if (body.purchase_date !== undefined) {
    const purchaseDate = body.purchase_date?.trim() || null
    if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return NextResponse.json({ error: 'Fecha de compra inválida (formato YYYY-MM-DD)' }, { status: 400 })
    }
    values.push(purchaseDate)
    sets.push(`purchase_date = $${values.length}`)
  }
  if (body.manual_dividend_received !== undefined) {
    const amount = body.manual_dividend_received
    if (amount !== null && !isFinite(Number(amount))) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    }
    values.push(amount)
    sets.push(`manual_dividend_received = $${values.length}`)
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })

  values.push(params.id)
  const { rows } = await pool.query(
    `update portfolio_positions_snapshot set ${sets.join(', ')} where id = $${values.length} returning *`,
    values
  )
  if (!rows[0]) return NextResponse.json({ error: 'Posición no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true, position: rows[0] })
}
