import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listPlantillas, createPlantilla, getPlantilla } from '@/lib/db/plantillas'
import { TIPOS_PLANTILLA, isTipoPlantilla, tituloDocumento } from '@/lib/plantillas/tipos'
import { datosIniciales } from '@/lib/plantillas/datosAuto'
import { esFechaIso } from '@/lib/masOperado/periodos'
import { isResearchCategoria } from '@/lib/research/labels'

export const dynamic = 'force-dynamic'

// GET /api/plantillas — documentos guardados (sin los datos)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ documentos: await listPlantillas() })
}

// POST /api/plantillas { tipo, categoria?, web? } → documento nuevo (categoria: dónde se publica en Research)
//   Más operados: { desde?, hasta? } período de las órdenes (por defecto el mes del informe), ya cargado.
//   Comparativo de fondos: { asset_class? } categoría del Monitor, ya cargada.
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
      researchType: orig.research_type, webPublicar: orig.web_publicar,
    })
    return NextResponse.json({ documento: doc })
  }

  const tipo: unknown = body.tipo
  if (!isTipoPlantilla(tipo)) return NextResponse.json({ error: 'Tipo de plantilla inválido' }, { status: 400 })
  const datos = await datosIniciales(tipo, {
    desde: esFechaIso(body.desde) ? body.desde : undefined,
    hasta: esFechaIso(body.hasta) ? body.hasta : undefined,
    asset_class: typeof body.asset_class === 'string' ? body.asset_class : undefined,
  })
  const doc = await createPlantilla({
    tipo, titulo: tituloDocumento(tipo, datos), datos, userName: session.name, userId: session.id,
    researchType: isResearchCategoria(body.categoria) ? body.categoria : null,
    webPublicar: body.web === true && TIPOS_PLANTILLA[tipo].web,
  })
  return NextResponse.json({ documento: doc })
}
