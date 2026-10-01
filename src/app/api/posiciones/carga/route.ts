import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { cargarPosiciones, type FilaPosicion } from '@/lib/db/clientPositions'
import { MESA_ROLES } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const maxDuration = 300


// POST /api/posiciones/carga — carga (o recarga) de posiciones desde el export
// de las cuentas. Reemplaza las posiciones de las cuentas que vienen en el archivo.
// Body: { filas: FilaPosicion[], fileName?: string, fechaDatos?: 'YYYY-MM-DD' }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!MESA_ROLES.includes(session.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { filas, fileName, fechaDatos } = await req.json() as { filas: FilaPosicion[]; fileName?: string; fechaDatos?: string }
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: 'No se recibieron posiciones' }, { status: 400 })
  }
  try {
    const result = await cargarPosiciones(filas, { fileName, fechaDatos, user: session.name })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
