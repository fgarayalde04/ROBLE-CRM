import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { reclassifyInstruments } from '@/lib/db/instruments'

export const dynamic = 'force-dynamic'

// POST /api/instruments/riesgo — recalcula el puntaje de todo el maestro
// (respeta los ajustes manuales). Útil después de cargar fondos al Monitor.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await reclassifyInstruments())
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
