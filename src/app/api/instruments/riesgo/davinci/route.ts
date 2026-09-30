import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getDavinciJobState, startDavinciCategorias } from '@/lib/riskDavinci'

export const dynamic = 'force-dynamic'

// GET  /api/instruments/riesgo/davinci — progreso de la búsqueda
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(getDavinciJobState())
}

// POST /api/instruments/riesgo/davinci?reintentar=1 — arranca la búsqueda de
// categorías en Davinci para los fondos sin clasificar (en segundo plano).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const reintentar = req.nextUrl.searchParams.get('reintentar') === '1'
  return NextResponse.json(startDavinciCategorias({ reintentar }))
}
