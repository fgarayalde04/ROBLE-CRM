// Detección de respuestas de cliente en la casilla de Mesa (trading@roblecapital.net).
//
// Dos gatillos, un solo procesador:
//   • Push (instantáneo): Gmail avisa a Pub/Sub → POST /api/webhooks/gmail.
//   • Respaldo: chequeo periódico desde instrumentation.ts, por si un aviso se
//     pierde o el watch venció. Con el historyId guardado es una sola llamada
//     barata a Gmail cuando no hay nada nuevo.
// Ambos terminan acá. Nada se notifica dos veces: gmail_message_id es UNIQUE en
// email_replies y las notificaciones se deduplican por (respuesta, usuario).

import { getValidMesaGoogleToken, invalidateMesaGoogleToken, MESA_GOOGLE_CONNECTION_KEY } from '@/lib/google/tokens'
import { getInboxMessage, getMailboxHistoryId, getMailboxProfile, listInboxMessageIdsSince } from '@/lib/google/gmail'
import { findSolicitudByThreadId, findSolicitudesByAsunto, getSolicitud, insertSolicitudEvento } from '@/lib/db/solicitudes'
import {
  insertEmailReply, markEmailReplyNotified, getMailWatchState, saveHistoryId, recordCheck,
  listUnnotifiedEmailReplies, type EmailReplyRow, type EmailReplyMatchMethod,
} from '@/lib/db/emailReplies'
import { notifyClienteRespondio } from '@/lib/notifications/orderEvents'
import { stripReplyPrefixes, hasReplyPrefix, isAutomatedSender, looksLikeReply, extractReplyText } from './replyMatching'

/**
 * Interruptor general. Apagado por defecto: desarrollo tiene una copia de la DB
 * de producción (con las suscripciones push de los usuarios reales), así que si
 * esto corriera en cualquier ambiente por defecto, un mail de prueba podría
 * mandar push a gente de verdad. Se prende solo con GMAIL_REPLY_WATCH_ENABLED=true.
 */
export function isReplyWatchEnabled() {
  return process.env.GMAIL_REPLY_WATCH_ENABLED === 'true'
}

// EMAIL_REPLY_DEBUG=true: deja en los logs cada decisión (qué casilla, qué mensajes
// vio, por qué descartó cada uno). Apagado por defecto para no llenar los logs.
const debugOn = () => process.env.EMAIL_REPLY_DEBUG === 'true'
const dbg = (...args: unknown[]) => { if (debugOn()) console.log('[mail-replies:debug]', ...args) }

export interface ProcessResult {
  ok: true
  skipped?: boolean
  reason?: string
  seeded?: boolean
  scanned?: number
  notified?: number
  retried?: number
  ignored?: number
}

/** Corre fn con el token de Mesa; si Gmail lo rechaza con 401, fuerza un refresh real y reintenta una vez. */
export async function withMesaToken<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
  const token = await getValidMesaGoogleToken()
  if (!token) return null
  try {
    return await fn(token)
  } catch (err: any) {
    if (err?.status !== 401) throw err
    // El access_token cacheado parecía vigente pero Gmail lo rechazó (revocado,
    // reloj desincronizado) — refresh real en vez de repetir el mismo token roto.
    await invalidateMesaGoogleToken()
    const fresh = await getValidMesaGoogleToken()
    if (!fresh) return null
    return fn(fresh)
  }
}

// Una corrida a la vez dentro del proceso: los avisos de Pub/Sub pueden llegar
// en ráfaga y a la vez que el chequeo de respaldo.
let queue: Promise<unknown> = Promise.resolve()

export function processMesaInbox(source: 'push' | 'poll'): Promise<ProcessResult> {
  const run = queue.catch(() => {}).then(() => runOnce(source))
  queue = run
  return run
}

async function runOnce(source: 'push' | 'poll'): Promise<ProcessResult> {
  const fromPush = source === 'push'
  try {
    const result = await withMesaToken((token) => scan(token))
    if (!result) {
      await recordCheck('skipped', 'Casilla de Mesa no conectada o token inválido', { fromPush })
      return { ok: true, skipped: true, reason: 'Casilla de Mesa no conectada o token inválido' }
    }
    await recordCheck('ok', JSON.stringify(result), { fromPush })
    return result
  } catch (err: any) {
    await recordCheck('error', err?.message ?? String(err), { fromPush })
    throw err
  }
}

async function scan(token: string): Promise<ProcessResult> {
  const state = await getMailWatchState()
  if (debugOn()) {
    const profile = await getMailboxProfile(token)
    dbg('casilla conectada:', profile.emailAddress, '| historyId actual de Gmail:', profile.historyId, '| guardado:', state.history_id)
  }

  // Primera vez: sembrar el punto de partida en "ahora" — nunca se notifica
  // nada recibido antes de activar esto.
  if (!state.history_id) {
    await saveHistoryId(await getMailboxHistoryId(token))
    return { ok: true, seeded: true }
  }

  // Notificaciones que quedaron a medias en una corrida anterior.
  let retried = 0
  for (const row of await listUnnotifiedEmailReplies(6)) {
    try { await deliver(row); retried++ } catch (e: any) {
      console.error('[mail-replies] reintento falló', row.id, e?.message)
    }
  }

  let history
  try {
    history = await listInboxMessageIdsSince(token, state.history_id)
  } catch (err: any) {
    if (err?.status !== 404) throw err
    // Gmail ya no guarda el historial desde ese punto (la casilla estuvo
    // desconectada o la app caída demasiado tiempo) — re-sembrar en "ahora".
    console.error('[mail-replies] historyId vencido, se re-siembra — se pudieron perder respuestas del período')
    await saveHistoryId(await getMailboxHistoryId(token))
    return { ok: true, seeded: true, reason: 'historyId vencido' }
  }

  dbg('history desde', state.history_id, 'hasta', history.historyId, '| mensajes nuevos en INBOX:', history.messageIds.length)

  // Si algo falla acá el historyId NO avanza (más abajo): en el próximo aviso o
  // chequeo de respaldo se vuelve a leer el mismo tramo. Lo ya procesado no se
  // duplica (insertEmailReply devuelve null) y lo que quedó a medias se reintenta arriba.
  let notified = 0
  let ignored = 0
  for (const id of history.messageIds) {
    if (await handleMessage(token, id)) notified++
    else ignored++
  }

  await saveHistoryId(history.historyId)
  return { ok: true, scanned: history.messageIds.length, notified, retried, ignored }
}

/** true si generó una notificación, false si se ignoró (propio, automático, no es respuesta, ya procesado). */
async function handleMessage(token: string, id: string): Promise<boolean> {
  const msg = await getInboxMessage(token, id)
  if (!msg) { dbg(id, 'ignorado: el mensaje ya no existe'); return false }
  dbg(id, 'de', msg.fromEmail, '| asunto:', msg.subject, '| hilo:', msg.threadId, '| labels:', msg.labelIds.join(','))
  if (msg.fromEmail.toLowerCase() === MESA_GOOGLE_CONNECTION_KEY) { dbg(id, 'ignorado: lo envió la propia casilla'); return false }
  if (msg.labelIds.includes('SENT') || msg.labelIds.includes('DRAFT')) { dbg(id, 'ignorado: SENT/DRAFT'); return false }
  if (isAutomatedSender(msg.fromEmail)) { dbg(id, 'ignorado: remitente automático'); return false }

  let solicitud: { id: string; client_name: string | null; asesor: string; asesor_id: string | null } | null = null
  let matchMethod: EmailReplyMatchMethod = 'unmatched'

  const byThread = await findSolicitudByThreadId(msg.threadId)
  if (byThread) {
    solicitud = byThread
    matchMethod = 'thread_id'
  } else if (hasReplyPrefix(msg.subject)) {
    const candidates = await findSolicitudesByAsunto(stripReplyPrefixes(msg.subject))
    if (candidates.length === 1) {
      solicitud = candidates[0]
      matchMethod = 'subject_fallback'
    }
    // 0 o >1 candidatos → queda sin matchear, nunca se adivina.
  }

  if (!solicitud && !looksLikeReply(msg)) { dbg(id, 'ignorado: sin orden asociada y no parece respuesta'); return false }

  const row = await insertEmailReply({
    gmail_message_id: msg.id,
    gmail_thread_id:  msg.threadId,
    solicitud_id:     solicitud?.id ?? null,
    match_method:     matchMethod,
    from_email:       msg.fromEmail,
    received_at:      msg.date,
    subject:          msg.subject,
    snippet:          msg.snippet,
  })
  // row === null: ya procesado antes (aviso duplicado / chequeo de respaldo).
  if (!row) { dbg(id, 'ignorado: ya procesado antes'); return false }

  dbg(id, 'guardado como', matchMethod, '— notificando')
  await deliver(row)
  dbg(id, 'notificación enviada')
  return true
}

async function deliver(row: EmailReplyRow) {
  const solicitud = row.solicitud_id ? await getSolicitud(row.solicitud_id) : null

  await notifyClienteRespondio(
    {
      replyId:     row.id,
      solicitudId: solicitud?.id ?? null,
      threadId:    row.gmail_thread_id,
      clientName:  solicitud?.client_name ?? null,
      fromEmail:   row.from_email,
      subject:     row.subject ?? '',
      snippet:     row.snippet ?? '',
      matchMethod: row.match_method,
    },
    solicitud ? { id: solicitud.asesor_id, name: solicitud.asesor } : null
  )

  if (solicitud) {
    const replyText = extractReplyText(row.snippet ?? '')
    await insertSolicitudEvento({
      solicitud_id: solicitud.id,
      tipo: 'cliente_respondio',
      descripcion: `${solicitud.client_name ?? 'El cliente'} respondió al mail de confirmación${row.match_method === 'subject_fallback' ? ' (coincidencia por asunto)' : ''}${replyText ? `: "${replyText}"` : '.'}`,
      usuario: 'Sistema',
      usuario_id: null,
    })
  }
  await markEmailReplyNotified(row.id)
}
