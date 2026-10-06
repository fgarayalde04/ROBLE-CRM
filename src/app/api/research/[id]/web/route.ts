import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPost, updatePost } from '@/lib/db/research'
import { getObjectBuffer } from '@/lib/storage/s3'
import { despublicarDocumentoWeb, publicarReporteWeb, webClientesConfigurada } from '@/lib/webClientes/client'
import { esSeccionWeb, requiereComentario, seccionWebDePlantilla, textoParaWeb } from '@/lib/webClientes/secciones'

export const maxDuration = 60

// El adjunto se guarda como /api/research/download?key=research/<archivo>
function claveAdjunto(fileUrl: string | null): string | null {
  if (!fileUrl) return null
  try {
    return new URL(fileUrl, 'http://crm.local').searchParams.get('key')
  } catch {
    return null
  }
}

async function autorizar() {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return { error: NextResponse.json({ error: 'No tenés permiso para publicar en la web de clientes' }, { status: 403 }) }
  }
  if (!webClientesConfigurada()) {
    return { error: NextResponse.json({ error: 'La web de clientes no está conectada (faltan WEB_CLIENTES_API_URL / WEB_CLIENTES_API_KEY en el servidor)' }, { status: 400 }) }
  }
  return { session }
}

// POST /api/research/[id]/web { section?, subsection?, notify_user_ids? }
// Publica el PDF adjunto en la web de clientes, con el resumen y el desarrollo
// escrito como texto (en Comité de Inversiones el comentario es obligatorio).
// Si viene de Plantillas, la sección la define el tipo de plantilla; si se
// cargó a mano, se elige.
// Si ya estaba publicado, lo reemplaza con el PDF actual. notify_user_ids =
// clientes de la web (GET /api/research/web-clientes) a avisar por mail.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autorizar()
  if (auth.error) return auth.error

  const post = await getPost(params.id)
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const notificar: string[] = Array.isArray(body.notify_user_ids)
    ? body.notify_user_ids.filter((x: unknown) => typeof x === 'string' && x)
    : []
  const fija = seccionWebDePlantilla(post.plantilla_tipo)
  const { section, subsection } = fija ?? body
  if (!esSeccionWeb(section, subsection)) {
    return NextResponse.json({ error: 'Elegí una sección de la web' }, { status: 400 })
  }
  // Lo cargado a mano lleva a la web el resumen y el desarrollo; lo de Plantillas, solo el resumen
  const descripcion = textoParaWeb(post, !fija)
  if (requiereComentario(section) && !post.body?.trim()) {
    return NextResponse.json({ error: 'Para Comité de Inversiones escribí el comentario del comité (Desarrollo) además del PDF' }, { status: 400 })
  }

  const key = claveAdjunto(post.file_url)
  const esPdf = (post.file_name ?? key ?? '').toLowerCase().endsWith('.pdf')
  if (!key || !esPdf) {
    return NextResponse.json({ error: 'Solo se pueden publicar en la web publicaciones con un PDF adjunto' }, { status: 400 })
  }

  try {
    const { body } = await getObjectBuffer(key)
    const r = await publicarReporteWeb({
      existente: post.web_document_id ? { reportId: post.web_document_id, filePath: '' } : null,
      seccion: { section, subsection },
      titulo: post.title,
      descripcion,
      pdf: body,
      nombreArchivo: post.file_name || 'documento.pdf',
      notificar,
    })
    const actualizado = await updatePost(post.id, {
      web_document_id: r.reportId,
      web_section: section,
      web_subsection: subsection,
      web_publicado_at: new Date().toISOString(),
    })
    return NextResponse.json({ post: actualizado, avisados: r.avisados ?? 0 })
  } catch (err: any) {
    console.error('[research/web] publicar', err.message)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}

// DELETE /api/research/[id]/web — saca la publicación de la web de clientes.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autorizar()
  if (auth.error) return auth.error

  const post = await getPost(params.id)
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })

  try {
    if (post.web_document_id) await despublicarDocumentoWeb(post.web_document_id)
    const actualizado = await updatePost(post.id, {
      web_document_id: null,
      web_section: null,
      web_subsection: null,
      web_publicado_at: null,
    })
    return NextResponse.json({ post: actualizado })
  } catch (err: any) {
    console.error('[research/web] despublicar', err.message)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
