import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listRiesgoClientes } from '@/lib/db/clientPositions'
import { MESA_ROLES } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'


// GET /api/posiciones — riesgo de la cartera de cada cliente vs. su perfil
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!MESA_ROLES.includes(session.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  try {
    return NextResponse.json(await listRiesgoClientes())
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
