import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

// PATCH /api/portfolio/positions/[id] — reclassify a single position's asset
// class by hand. Used for Morgan Stanley positions the automatic heuristic
// left "Sin clasificar" (no security-type column exists in that export, so
// the parser never guesses Equity — the advisor confirms it here instead).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { asset_class?: string }
  const assetClass = body.asset_class?.trim()
  if (!assetClass) return NextResponse.json({ error: 'Falta asset_class' }, { status: 400 })

  const { rows } = await pool.query(
    `update portfolio_positions_snapshot set asset_class = $1 where id = $2 returning *`,
    [assetClass, params.id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'Posición no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true, position: rows[0] })
}
