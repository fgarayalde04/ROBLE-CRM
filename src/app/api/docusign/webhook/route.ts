import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { mapDsEstado } from '@/lib/docusign'

// POST /api/docusign/webhook  — DocuSign Connect webhook
// Configurar en DocuSign Admin > Connect > Add Configuration:
//   URL: https://tu-dominio.com/api/docusign/webhook
//   Events: envelope-sent, envelope-delivered, envelope-completed, envelope-declined, envelope-voided

export async function POST(req: NextRequest) {
  // DocuSign envía XML o JSON según configuración
  // Usamos JSON (configurar "Include Basic Auth Data" = false, format = JSON)
  let payload: any
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('json')) {
    payload = await req.json()
  } else {
    // XML fallback — parsear manualmente si fuera necesario
    return NextResponse.json({ ok: false, msg: 'Only JSON format supported' }, { status: 400 })
  }

  const envelopeId  = payload?.envelopeId ?? payload?.EnvelopeStatus?.EnvelopeID
  const dsStatus    = payload?.status      ?? payload?.EnvelopeStatus?.Status
  const completedAt = payload?.completedDateTime ?? payload?.EnvelopeStatus?.Completed

  if (!envelopeId) return NextResponse.json({ ok: false, msg: 'No envelopeId' }, { status: 400 })

  // Buscar el envelope en la BD por envelope_id de DocuSign
  const { data: env } = await supabaseAdmin
    .from('docusign_envelopes')
    .select('id, estado')
    .eq('envelope_id', envelopeId)
    .single()

  if (!env) return NextResponse.json({ ok: false, msg: 'Envelope no registrado' }, { status: 200 })

  const nuevoEstado = mapDsEstado(dsStatus?.toLowerCase() ?? '')

  await supabaseAdmin.from('docusign_envelopes').update({
    estado:         nuevoEstado,
    ds_status:      dsStatus,
    ds_completed_at: completedAt ?? null,
    updated_at:     new Date().toISOString(),
  }).eq('id', env.id)

  await supabaseAdmin.from('docusign_eventos').insert({
    envelope_db_id: env.id,
    envelope_id:    envelopeId,
    tipo:           `envelope-${dsStatus?.toLowerCase()}`,
    datos:          payload,
  })

  return NextResponse.json({ ok: true })
}
