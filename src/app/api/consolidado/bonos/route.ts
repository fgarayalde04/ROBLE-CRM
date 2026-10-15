import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { terminosDeBonos } from '@/lib/consolidado/figi'

export const dynamic = 'force-dynamic'

// POST /api/consolidado/bonos { cusips } — cupón y vencimiento de OpenFIGI para
// los bonos que no los traen en los reportes de los bancos.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const cusips = Array.isArray(body?.cusips) ? body.cusips.filter((c: unknown): c is string => typeof c === 'string') : []
  return NextResponse.json({ terminos: await terminosDeBonos(cusips.map((c: string) => c.trim().toUpperCase())) })
}
