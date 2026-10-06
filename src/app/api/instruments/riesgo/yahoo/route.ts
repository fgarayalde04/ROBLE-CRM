import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getYahooJobState, startYahooSectores } from '@/lib/riskYahoo'

export const dynamic = 'force-dynamic'

// GET  /api/instruments/riesgo/yahoo — progreso de la búsqueda de sector/país
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(getYahooJobState())
}

// POST /api/instruments/riesgo/yahoo — arranca la búsqueda (segundo plano)
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(startYahooSectores())
}
