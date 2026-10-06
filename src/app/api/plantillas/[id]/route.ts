import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPlantilla, updatePlantilla, deletePlantilla, setResearchType, setWebPublicar } from '@/lib/db/plantillas'
import { isResearchCategoria } from '@/lib/research/labels'
import { tituloDocumento } from '@/lib/plantillas/tipos'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ documento: doc })
}

// PATCH { datos?, categoria?, web? } — guarda los datos (el título se deriva de ellos) y/o la categoría de Research
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const body = await req.json()
  if ('categoria' in body) await setResearchType(params.id, isResearchCategoria(body.categoria) ? body.categoria : null)
  if ('web' in body) await setWebPublicar(params.id, body.web === true)
  if (!body.datos && ('categoria' in body || 'web' in body)) return NextResponse.json({ ok: true })
  const { datos } = body
  if (!datos || typeof datos !== 'object') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const updated = await updatePlantilla(params.id, { titulo: tituloDocumento(doc.tipo, datos), datos, userName: session.name })
  return NextResponse.json({ documento: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  await deletePlantilla(params.id)
  return NextResponse.json({ ok: true })
}
