import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { crearYEnviarEnvelope, mapDsEstado } from '@/lib/docusign'

// POST /api/docusign/[id]/enviar  — genera los DOCX y los envía a DocuSign
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Cargar el envelope de la BD
  const { data: env, error: fetchErr } = await supabaseAdmin
    .from('docusign_envelopes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !env) return NextResponse.json({ error: 'Envelope no encontrado' }, { status: 404 })
  if (!['borrador', 'pendiente_envio'].includes(env.estado)) {
    return NextResponse.json({ error: 'Este envío ya fue procesado' }, { status: 400 })
  }

  // Generar los DOCX desde la API de generación interna
  const body = await req.json().catch(() => ({}))
  const documentosGenerados: { nombre: string; contenido: Buffer; tipo: 'docx' | 'pdf' }[] = []

  // body.documentos_data: array de { doc, ficha_data, perfil_data, lista_data }
  const docsData: any[] = body.documentos_data ?? []

  for (const docInfo of docsData) {
    const genRes = await fetch(new URL('/api/bc-ficha/generate', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        empresa:     env.empresa,
        tipo_cliente: env.tipo_cliente,
        doc:          docInfo.doc,
        format:       'docx',
        ficha_data:   docInfo.ficha_data,
        perfil_data:  docInfo.perfil_data,
        lista_data:   docInfo.lista_data,
      }),
    })
    if (!genRes.ok) continue
    const buf = Buffer.from(await genRes.arrayBuffer())
    documentosGenerados.push({
      nombre:    docInfo.nombre ?? `${docInfo.doc}.docx`,
      contenido: buf,
      tipo:      'docx',
    })
  }

  // Si además hay archivos subidos manualmente, vienen en env.documentos con url_temp
  // (por ahora solo soportamos los generados desde el CRM)

  if (documentosGenerados.length === 0) {
    return NextResponse.json({ error: 'No hay documentos para enviar' }, { status: 400 })
  }

  // Construir firmantes
  const firmantes = (env.firmantes as any[]).map((f: any, i: number) => ({
    nombre:   f.nombre   ?? '',
    apellido: f.apellido ?? '',
    email:    f.email,
    rol:      f.rol      ?? 'Firmante',
    orden:    f.orden    ?? i + 1,
  }))

  // Construir asunto
  const asunto = `Documentos para firma — ${env.client_name} (${env.empresa === 'roble' ? 'Roble Capital' : 'Geliene'})`

  try {
    const { envelopeId } = await crearYEnviarEnvelope({
      asunto,
      mensaje:     env.mensaje ?? '',
      firmantes,
      documentos:  documentosGenerados,
      fechaLimite: env.fecha_limite ? new Date(env.fecha_limite) : undefined,
    })

    // Actualizar estado en BD
    await supabaseAdmin
      .from('docusign_envelopes')
      .update({
        envelope_id:  envelopeId,
        estado:       'enviado',
        ds_status:    'sent',
        ds_sent_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', params.id)

    // Registrar evento
    await supabaseAdmin.from('docusign_eventos').insert({
      envelope_db_id: params.id,
      envelope_id:    envelopeId,
      tipo:           'envelope-sent',
      datos:          { enviado_por: session.name, documentos: documentosGenerados.map(d => d.nombre) },
      usuario_id:     session.id,
    })

    return NextResponse.json({ ok: true, envelopeId })
  } catch (err: any) {
    console.error('[docusign/enviar]', err?.message)

    // Si es error de consent, dar instrucción clara
    if (err?.message?.includes('consent_required')) {
      return NextResponse.json({
        error: 'Se requiere autorización inicial de DocuSign. Ingresá a la URL de consent y luego reintentá.',
        consent_required: true,
        consent_url: `https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${process.env.DOCUSIGN_INTEGRATION_KEY}&redirect_uri=${process.env.DOCUSIGN_REDIRECT_URI ?? 'https://localhost'}`,
      }, { status: 403 })
    }

    return NextResponse.json({ error: err?.message ?? 'Error enviando a DocuSign' }, { status: 500 })
  }
}
