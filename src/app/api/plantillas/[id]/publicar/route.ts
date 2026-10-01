import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPlantilla, setResearchPublicado, setResearchType } from '@/lib/db/plantillas'
import { createPost, getPost, updatePost } from '@/lib/db/research'
import { uploadObject } from '@/lib/storage/s3'
import { generarPdfPlantilla, nombreArchivo } from '@/lib/plantillas/pdf'
import { camposFaltantes, type AnalisisBonosDatos, type FichaBonoDatos } from '@/lib/plantillas/tipos'
import { isResearchCategoria } from '@/lib/research/labels'

export const maxDuration = 60

// Campos de la publicación de Research que salen de los datos del documento.
function camposPost(tipo: string, datos: any) {
  if (tipo === 'ficha_bono') {
    const d = datos as FichaBonoDatos
    const precio = [d.precio && `Precio indicativo ${d.precio}`, d.tir && `TIR ${d.tir}`].filter(Boolean).join(' · ')
    return {
      summary: [d.subtitulo, precio].filter((x) => x?.trim()).join('. ') || null,
      issuer: d.emisor || d.emisor_largo || null,
      isin: d.isin || null,
      coupon: d.cupon || null,
      maturity: d.vencimiento || null,
      yield_value: d.tir || null,
    }
  }
  const d = datos as AnalisisBonosDatos
  const primero = (d.sobre_emisor ?? '').split(/\n\s*\n/)[0]?.trim() ?? ''
  return {
    summary: [d.subtitulo?.trim(), primero.length > 320 ? `${primero.slice(0, 317)}…` : primero].filter(Boolean).join('. ') || null,
    issuer: d.emisor_largo || null,
    yield_value: d.tir || null,
  }
}

// POST /api/plantillas/[id]/publicar { categoria? }
// Genera el PDF y crea (o actualiza) la publicación del documento en Research & Novedades.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para publicar en Research & Novedades' }, { status: 403 })
  }
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const categoria = body.categoria ?? doc.research_type
  if (!isResearchCategoria(categoria)) return NextResponse.json({ error: 'Elegí una categoría de Research' }, { status: 400 })
  if (categoria !== doc.research_type) await setResearchType(doc.id, categoria)

  const faltan = camposFaltantes(doc.tipo, doc.datos)
  if (faltan.length) return NextResponse.json({ error: `Faltan completar: ${faltan.join(', ')}`, faltan }, { status: 400 })

  try {
    const pdf = await generarPdfPlantilla(doc.id, doc.tipo, session)
    const nombre = nombreArchivo(doc.titulo)
    const key = `research/plantillas/${doc.id}/${Date.now()}_${nombre.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await uploadObject(key, pdf, 'application/pdf')

    const record = {
      type: categoria,
      title: doc.titulo,
      ...camposPost(doc.tipo, doc.datos),
      file_url: `/api/research/download?key=${encodeURIComponent(key)}`,
      file_name: nombre,
    }

    const existente = doc.research_post_id ? await getPost(doc.research_post_id) : null
    const post = existente && !existente.archived
      ? await updatePost(existente.id, record)
      : await createPost({ ...record, author: session.name, created_by: session.id, created_by_name: session.name })

    await setResearchPublicado(doc.id, post.id)
    return NextResponse.json({ ok: true, post: { id: post.id, type: post.type }, actualizado: !!existente })
  } catch (err: any) {
    console.error('[plantillas/publicar]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
