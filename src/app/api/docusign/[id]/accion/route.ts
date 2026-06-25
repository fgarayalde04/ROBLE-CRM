import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  reenviarRecordatorio,
  cancelarEnvelope,
  getEnvelopeStatus,
  downloadSignedDoc,
  downloadCertificate,
  mapDsEstado,
} from '@/lib/docusign'

// POST /api/docusign/[id]/accion
// body: { accion: 'recordatorio' | 'cancelar' | 'sync' | 'descargar_firmado' | 'descargar_certificado', motivo? }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { accion, motivo } = await req.json()

  const { data: env } = await supabaseAdmin
    .from('docusign_envelopes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!env) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!env.envelope_id) return NextResponse.json({ error: 'Aún no enviado a DocuSign' }, { status: 400 })

  try {
    if (accion === 'recordatorio') {
      await reenviarRecordatorio(env.envelope_id)
      await supabaseAdmin.from('docusign_eventos').insert({
        envelope_db_id: params.id, envelope_id: env.envelope_id,
        tipo: 'reminder-sent', datos: { usuario: session.name }, usuario_id: session.id,
      })
      return NextResponse.json({ ok: true, mensaje: 'Recordatorio enviado' })
    }

    if (accion === 'cancelar') {
      await cancelarEnvelope(env.envelope_id, motivo)
      await supabaseAdmin.from('docusign_envelopes').update({
        estado: 'cancelado', ds_voided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', params.id)
      await supabaseAdmin.from('docusign_eventos').insert({
        envelope_db_id: params.id, envelope_id: env.envelope_id,
        tipo: 'envelope-voided', datos: { motivo, usuario: session.name }, usuario_id: session.id,
      })
      return NextResponse.json({ ok: true })
    }

    if (accion === 'sync') {
      const status = await getEnvelopeStatus(env.envelope_id)
      const nuevoEstado = mapDsEstado(status.status ?? '')
      await supabaseAdmin.from('docusign_envelopes').update({
        estado: nuevoEstado, ds_status: status.status,
        ds_completed_at: status.completedDateTime ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)
      return NextResponse.json({ ok: true, estado: nuevoEstado, ds_status: status.status })
    }

    if (accion === 'descargar_firmado') {
      const buf = await downloadSignedDoc(env.envelope_id)
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${env.client_name}-firmado.pdf"`,
        },
      })
    }

    if (accion === 'descargar_certificado') {
      const buf = await downloadCertificate(env.envelope_id)
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${env.client_name}-certificado.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err: any) {
    console.error('[docusign/accion]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Error' }, { status: 500 })
  }
}
