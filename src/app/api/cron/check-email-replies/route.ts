import { NextRequest, NextResponse } from 'next/server'
import { getValidMesaGoogleToken } from '@/lib/google/tokens'
import { listInboxSince } from '@/lib/google/gmail'
import { findSolicitudByThreadId, findSolicitudesByAsunto } from '@/lib/db/solicitudes'
import { insertEmailReply, markEmailReplyNotified, type EmailReplyMatchMethod } from '@/lib/db/emailReplies'
import { insertSolicitudEvento } from '@/lib/db/solicitudes'
import { notifyClienteRespondio } from '@/lib/notifications/orderEvents'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MESA_EMAIL = 'trading@roblecapital.net'

// Ventana de mirada hacia atrás: más ancha que la cadencia del cron a
// propósito, para no perder respuestas si una corrida falla o se saltea.
// Reprocesar mensajes ya vistos no duplica nada — gmail_message_id es UNIQUE
// en email_replies (on conflict do nothing).
const LOOKBACK_DAYS = 3
const MAX_RESULTS = 50

// "Re: Re: Confirmacion de orden - ..." → "Confirmacion de orden - ..."
function stripReplyPrefixes(subject: string): string {
  return subject.replace(/^\s*(re|rv|fwd|fw)\s*:\s*/i, '').trim()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = await getValidMesaGoogleToken()
  if (!accessToken) {
    // Esperado hasta que un admin conecte la casilla de Mesa desde
    // Configuración — no es un error del cron en sí.
    return NextResponse.json({ ok: true, skipped: true, reason: 'Casilla de Mesa no conectada' })
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  let messages
  try {
    messages = await listInboxSince(accessToken, since, MAX_RESULTS)
  } catch (err: any) {
    console.error('[cron/check-email-replies] Gmail list error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  let inserted = 0
  let matchedThreadId = 0
  let matchedSubject = 0
  let unmatched = 0
  let skippedSelf = 0

  for (const msg of messages) {
    if (msg.fromEmail?.toLowerCase() === MESA_EMAIL) { skippedSelf++; continue }

    let solicitud: { id: string; client_name: string | null; asesor: string; asesor_id: string | null } | null = null
    let matchMethod: EmailReplyMatchMethod = 'unmatched'

    const byThread = await findSolicitudByThreadId(msg.threadId)
    if (byThread) {
      solicitud = byThread
      matchMethod = 'thread_id'
    } else {
      const normalized = stripReplyPrefixes(msg.subject)
      const candidates = await findSolicitudesByAsunto(normalized)
      if (candidates.length === 1) {
        solicitud = candidates[0]
        matchMethod = 'subject_fallback'
      }
      // 0 o >1 candidatos → queda sin matchear, nunca se adivina.
    }

    const row = await insertEmailReply({
      gmail_message_id: msg.id,
      gmail_thread_id:  msg.threadId,
      solicitud_id:     solicitud?.id ?? null,
      match_method:     matchMethod,
      from_email:       msg.fromEmail,
      received_at:      msg.date,
    })

    // row === null: ya se había procesado este mensaje en una corrida anterior
    // (ventanas superpuestas por diseño) — no reenviar notificación.
    if (!row) continue

    inserted++
    if (matchMethod === 'thread_id') matchedThreadId++
    else if (matchMethod === 'subject_fallback') matchedSubject++
    else unmatched++

    if (solicitud) {
      await insertSolicitudEvento({
        solicitud_id: solicitud.id,
        tipo: 'cliente_respondio',
        descripcion: `${solicitud.client_name ?? 'El cliente'} respondió al mail de confirmación${matchMethod === 'subject_fallback' ? ' (coincidencia por asunto)' : ''}.`,
        usuario: 'Sistema',
        usuario_id: null,
      })
      await notifyClienteRespondio({
        replyId:      row.id,
        solicitudId:  solicitud.id,
        clientName:   solicitud.client_name,
        asesorName:   solicitud.asesor,
        asesorId:     solicitud.asesor_id,
        matchMethod:  matchMethod === 'subject_fallback' ? 'subject_fallback' : 'thread_id',
      })
      await markEmailReplyNotified(row.id)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: messages.length,
    inserted,
    matchedThreadId,
    matchedSubject,
    unmatched,
    skippedSelf,
  })
}
