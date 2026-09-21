import { pool } from './pool'

export type EmailReplyMatchMethod = 'thread_id' | 'subject_fallback' | 'unmatched'

export interface EmailReplyInsert {
  gmail_message_id: string
  gmail_thread_id: string
  solicitud_id: string | null
  match_method: EmailReplyMatchMethod
  from_email: string
  received_at: string
  subject: string
  snippet: string
}

export interface EmailReplyRow extends EmailReplyInsert {
  id: string
  notified: boolean
  created_at: string
}

// Inserta una respuesta detectada. Idempotente: gmail_message_id es UNIQUE, así
// que si el mismo mensaje llega dos veces (aviso de Pub/Sub + chequeo de
// respaldo, o un reintento de Pub/Sub) nunca se duplica — devuelve null si ya
// existía.
export async function insertEmailReply(input: EmailReplyInsert): Promise<EmailReplyRow | null> {
  const { rows } = await pool.query(
    `insert into email_replies (gmail_message_id, gmail_thread_id, solicitud_id, match_method, from_email, received_at, subject, snippet)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (gmail_message_id) do nothing
     returning *`,
    [input.gmail_message_id, input.gmail_thread_id, input.solicitud_id, input.match_method, input.from_email, input.received_at, input.subject, input.snippet]
  )
  return (rows[0] as EmailReplyRow) ?? null
}

// Respuesta ya guardada pero cuya notificación no llegó a completarse
// (la corrida anterior falló a mitad de camino) — se reintenta en vez de perderla.
export async function getUnnotifiedEmailReply(gmailMessageId: string): Promise<EmailReplyRow | null> {
  const { rows } = await pool.query(
    `select * from email_replies where gmail_message_id = $1 and notified = false`,
    [gmailMessageId]
  )
  return (rows[0] as EmailReplyRow) ?? null
}

export async function markEmailReplyNotified(id: string) {
  await pool.query(`update email_replies set notified = true where id = $1`, [id])
}

// ─── Estado del watch de Gmail (fila única) ──────────────────────────────────

export interface MailWatchState {
  history_id: string | null
  watch_expiration: string | null
  last_checked_at: string | null
  last_status: string | null
  last_error: string | null
  last_push_at: string | null
}

export async function getMailWatchState(): Promise<MailWatchState> {
  const { rows } = await pool.query(`select * from mail_watch_state where id = 1`)
  return (rows[0] as MailWatchState) ?? {
    history_id: null, watch_expiration: null, last_checked_at: null,
    last_status: null, last_error: null, last_push_at: null,
  }
}

export async function saveHistoryId(historyId: string) {
  await pool.query(
    `insert into mail_watch_state (id, history_id) values (1, $1)
     on conflict (id) do update set history_id = excluded.history_id, updated_at = now()`,
    [historyId]
  )
}

export async function saveWatchExpiration(expiration: Date) {
  await pool.query(
    `insert into mail_watch_state (id, watch_expiration) values (1, $1)
     on conflict (id) do update set watch_expiration = excluded.watch_expiration, updated_at = now()`,
    [expiration.toISOString()]
  )
}

// Diagnóstico: se llama en cada corrida (éxito o error) para poder ver desde la
// base, sin acceso a los logs de Railway, si el chequeo realmente está andando
// y cuándo llegó el último aviso de Pub/Sub. Best-effort.
export async function recordCheck(status: string, error?: string | null, opts?: { fromPush?: boolean }) {
  try {
    await pool.query(
      `insert into mail_watch_state (id, last_checked_at, last_status, last_error, last_push_at)
       values (1, now(), $1, $2, case when $3 then now() else null end)
       on conflict (id) do update set
         last_checked_at = now(), last_status = excluded.last_status, last_error = excluded.last_error,
         last_push_at = case when $3 then now() else mail_watch_state.last_push_at end`,
      [status, error ?? null, opts?.fromPush === true]
    )
  } catch {
    // best-effort — nunca debe tirar la corrida entera por esto
  }
}

// Respuestas guardadas cuya notificación no se completó, de las últimas N horas.
export async function listUnnotifiedEmailReplies(hours: number): Promise<EmailReplyRow[]> {
  const { rows } = await pool.query(
    `select * from email_replies
     where notified = false and created_at > now() - ($1 || ' hours')::interval
     order by created_at asc limit 50`,
    [String(hours)]
  )
  return rows as EmailReplyRow[]
}
