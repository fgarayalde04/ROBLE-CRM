import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listPlantillas, createPlantilla, getPlantilla } from '@/lib/db/plantillas'
import { datosVacios, isTipoPlantilla, tituloDocumento } from '@/lib/plantillas/tipos'

export const dynamic = 'force-dynamic'

// GET /api/plantillas — documentos guardados (sin los datos)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ documentos: await listPlantillas() })
}

// POST /api/plantillas { tipo } → documento nuevo vacío
// POST /api/plantillas { duplicar: id } → copia de un documento existente
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body.duplicar) {
    const orig = await getPlantilla(String(body.duplicar))
    if (!orig) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    const doc = await createPlantilla({
      tipo: orig.tipo, titulo: `${orig.titulo} (copia)`, datos: orig.datos, userName: session.name, userId: session.id,
    })
    return NextResponse.json({ documento: doc })
  }

  if (!isTipoPlantilla(body.tipo)) return NextResponse.json({ error: 'Tipo de plantilla inválido' }, { status: 400 })
  const datos = datosVacios(body.tipo)
  const doc = await createPlantilla({
    tipo: body.tipo, titulo: tituloDocumento(body.tipo, datos), datos, userName: session.name, userId: session.id,
  })
  return NextResponse.json({ documento: doc })
}
