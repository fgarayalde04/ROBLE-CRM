import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { getRankingMasOperado } from '@/lib/db/masOperado'
import { esFechaIso } from '@/lib/masOperado/periodos'

export const dynamic = 'force-dynamic'

// GET /api/mas-operado?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — lo más comprado y
// vendido en la empresa en el período (fondos, bonos y acciones), según las órdenes.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'orders', session.permissions) && !hasPermission(session.role, 'research', session.permissions)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }
  const desde = req.nextUrl.searchParams.get('desde')
  const hasta = req.nextUrl.searchParams.get('hasta')
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  try {
    return NextResponse.json({ desde, hasta, ranking: await getRankingMasOperado(desde, hasta) })
  } catch (err: any) {
    console.error('[mas-operado]', err.message)
    return NextResponse.json({ error: 'No se pudo calcular el ranking' }, { status: 500 })
  }
}
