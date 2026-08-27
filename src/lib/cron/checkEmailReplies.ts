// Detección de respuestas de cliente a mails de confirmación de orden.
// Extraído a función standalone (en vez de vivir solo en la ruta HTTP) porque
// la app corre en Railway como proceso long-running — igual que el auto-sync
// de SharePoint, esto se dispara desde src/instrumentation.ts con setInterval,
// no con un cron serverless. La ruta /api/cron/check-email-replies se
// mantiene aparte solo como gatillo manual (pruebas, un ping externo si hiciera falta).

import { getValidMesaGoogleToken } from '@/lib/google/tokens'
import { listInboxSince } from '@/lib/google/gmail'
import { findSolicitudByThreadId, findSolicitudesByAsunto, insertSolicitudEvento } from '@/lib/db/solicitudes'
import { insertEmailReply, markEmailReplyNotified, type EmailReplyMatchMethod } from '@/lib/db/emailReplies'
import { notifyClienteRespondio } from '@/lib/notifications/orderEvents'

const MESA_EMAIL = 'trading@roblecapital.net'

// Ventana de mirada hacia atrás: más ancha que la cadencia de corrida a
// propósito, para no perder respuestas si una corrida falla o se saltea.
// Reprocesar mensajes ya vistos no duplica nada — gmail_message_id es UNIQUE
// en email_replies (on conflict do nothing).
const LOOKBACK_DAYS = 3
const MAX_RESULTS = 50

// "Re: Re: Confirmacion de orden - ..." → "Confirmacion de orden - ..."
function stripReplyPrefixes(subject: string): string {
  return subject.replace(/^\s*(re|rv|fwd|fw)\s*:\s*/i, '').trim()
}

export interface CheckEmailRepliesResult {
  ok: true
  skipped?: boolean
  reason?: string
  scanned?: number
  inserted?: number
  matchedThreadId?: number
  matchedSubject?: number
  unmatched?: number
  skippedSelf?: number
}

export async function checkEmailReplies(): Promise<CheckEmailRepliesResult> {
  const accessToken = await getValidMesaGoogleToken()
  if (!accessToken) {
    // Esperado hasta que un admin conecte la casilla de Mesa desde
    // Configuración — no es un error.
    return { ok: true, skipped: true, reason: 'Casilla de Mesa no conectada' }
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const messages = await listInboxSince(accessToken, since, MAX_RESULTS)

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

  return { ok: true, scanned: messages.length, inserted, matchedThreadId, matchedSubject, unmatched, skippedSelf }
}
