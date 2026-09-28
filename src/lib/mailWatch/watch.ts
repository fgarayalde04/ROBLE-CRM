// Registro/renovación del "watch" de Gmail sobre la bandeja de trading@.
// Gmail lo hace vencer a los 7 días como máximo → se renueva seguido (ver
// instrumentation.ts); renovar un watch vigente es inocuo.

import { watchInbox } from '@/lib/google/gmail'
import { getMailWatchState, saveHistoryId, saveWatchExpiration } from '@/lib/db/emailReplies'
import { withMesaToken } from './processMesaInbox'

export interface WatchResult {
  ok: true
  skipped?: boolean
  reason?: string
  expiration?: string
}

export async function ensureMailWatch(): Promise<WatchResult> {
  const topic = process.env.GMAIL_PUSH_TOPIC
  if (!topic) {
    // Sin topic no hay push instantáneo, pero el chequeo de respaldo sigue funcionando.
    return { ok: true, skipped: true, reason: 'GMAIL_PUSH_TOPIC no configurado' }
  }

  const res = await withMesaToken((token) => watchInbox(token, topic))
  if (!res) return { ok: true, skipped: true, reason: 'Casilla de Mesa no conectada o token inválido' }

  await saveWatchExpiration(res.expiration)
  // Si todavía no hay punto de partida, es este: nada de antes del watch se notifica.
  if (!(await getMailWatchState()).history_id) await saveHistoryId(res.historyId)

  return { ok: true, expiration: res.expiration.toISOString() }
}
