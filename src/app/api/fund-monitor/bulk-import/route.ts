import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

// Fix puntual: agrega/completa sort_order (posición real de cada fondo en el
// Excel original) porque el acceso directo a Postgres desde el entorno del
// asistente está bloqueado por red. Requiere sesión de admin.
//
// TODO: borrar esta ruta una vez aplicado el fix — es de un solo uso.

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await pool.query('ALTER TABLE fund_monitor_funds ADD COLUMN IF NOT EXISTS sort_order integer')

  const { rows: order } = await req.json() as { rows: { isin: string; sort_order: number }[] }
  if (!Array.isArray(order)) {
    return NextResponse.json({ error: 'Falta rows[]' }, { status: 400 })
  }

  let updated = 0
  for (const { isin, sort_order } of order) {
    const r = await pool.query('update fund_monitor_funds set sort_order = $1 where isin = $2', [sort_order, isin])
    updated += r.rowCount ?? 0
  }

  return NextResponse.json({ updated, total: order.length })
}
