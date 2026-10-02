import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPlantilla, setResearchPublicado, setWebPublicado } from '@/lib/db/plantillas'
import { publicarReporteWeb, webClientesConfigurada, type DatosBonoWeb } from '@/lib/webClientes/client'
import { createPost, getPost, updatePost } from '@/lib/db/research'
import { uploadObject } from '@/lib/storage/s3'
import { generarPdfPlantilla, nombreArchivo } from '@/lib/plantillas/pdf'
import { TIPOS_PLANTILLA, camposFaltantes, type AnalisisBonosDatos, type FichaBonoDatos } from '@/lib/plantillas/tipos'
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
  if (tipo === 'comparativo_fondos' || tipo === 'mas_operado_fondos' || tipo === 'mas_operado_bonos') {
    const primero = String(datos?.comentario || datos?.vision || '').split(/\n\s*\n/)[0]?.trim() ?? ''
    return {
      summary: [datos?.subtitulo?.trim(), primero.length > 320 ? `${primero.slice(0, 317)}…` : primero].filter(Boolean).join('. ') || null,
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

// Datos del bono que la web de clientes muestra junto al PDF en Renta fija.
function datosBonoWeb(tipo: string, datos: any): DatosBonoWeb {
  if (tipo === 'ficha_bono') {
    const d = datos as FichaBonoDatos
    return {
      issuer: d.emisor || d.emisor_largo || null, isin: d.isin || null, coupon: d.cupon || null,
      maturity: d.vencimiento || null, price: d.precio || null, yield_value: d.tir || null, rating: d.calificacion || null,
    }
  }
  const d = datos as AnalisisBonosDatos
  return { issuer: d.emisor_largo || null, price: d.precio || null, yield_value: d.tir || null }
}

// POST /api/plantillas/[id]/publicar { categoria?, web? }
// Genera el PDF una vez y lo publica (o actualiza) en Research & Novedades
// (si tiene categoría) y en la web de clientes (si está marcada). Un destino
// que falla no frena al otro: se informa cada uno por separado.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para publicar' }, { status: 403 })
  }
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const categoria = 'categoria' in body ? body.categoria : doc.research_type
  const web = TIPOS_PLANTILLA[doc.tipo].web && ('web' in body ? body.web === true : doc.web_publicar)
  if (categoria && !isResearchCategoria(categoria)) return NextResponse.json({ error: 'Categoría de Research inválida' }, { status: 400 })
  if (!categoria && !web) return NextResponse.json({ error: 'Elegí dónde publicarlo' }, { status: 400 })
  if (web && !webClientesConfigurada()) return NextResponse.json({ error: 'La web de clientes no está conectada (faltan WEB_CLIENTES_* en el servidor)' }, { status: 400 })

  const faltan = camposFaltantes(doc.tipo, doc.datos)
  if (faltan.length) return NextResponse.json({ error: `Faltan completar: ${faltan.join(', ')}`, faltan }, { status: 400 })

  let pdf: Buffer
  try {
    pdf = await generarPdfPlantilla(doc.id, doc.tipo, session)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
  const nombre = nombreArchivo(doc.titulo)
  const campos = camposPost(doc.tipo, doc.datos)
  const resultado: { research?: { ok: boolean; error?: string; postId?: string }; web?: { ok: boolean; error?: string } } = {}

  if (categoria) {
    try {
      const key = `research/plantillas/${doc.id}/${Date.now()}_${nombre.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await uploadObject(key, pdf, 'application/pdf')
      const record = {
        type: categoria, title: doc.titulo, ...campos,
        file_url: `/api/research/download?key=${encodeURIComponent(key)}`, file_name: nombre,
      }
      const existente = doc.research_post_id ? await getPost(doc.research_post_id) : null
      const post = existente && !existente.archived
        ? await updatePost(existente.id, record)
        : await createPost({ ...record, author: session.name, created_by: session.id, created_by_name: session.name })
      await setResearchPublicado(doc.id, post.id)
      resultado.research = { ok: true, postId: post.id }
    } catch (err: any) {
      console.error('[plantillas/publicar] research', err.message)
      resultado.research = { ok: false, error: err.message }
    }
  }

  if (web) {
    try {
      const r = await publicarReporteWeb({
        existente: doc.web_report_id ? { reportId: doc.web_report_id, filePath: doc.web_file_path ?? '' } : null,
        categoria: doc.tipo === 'ficha_bono' ? 'nuevas_emisiones' : 'analisis_bonos',
        titulo: doc.titulo,
        descripcion: campos.summary,
        bono: datosBonoWeb(doc.tipo, doc.datos),
        pdf,
        nombreArchivo: nombre,
      })
      await setWebPublicado(doc.id, r.reportId, r.filePath)
      resultado.web = { ok: true }
    } catch (err: any) {
      console.error('[plantillas/publicar] web', err.message)
      resultado.web = { ok: false, error: err.message }
    }
  }

  const fallos = [resultado.research, resultado.web].filter((r) => r && !r.ok)
  return NextResponse.json({ ok: fallos.length === 0, ...resultado }, { status: fallos.length && fallos.length === [resultado.research, resultado.web].filter(Boolean).length ? 500 : 200 })
}
