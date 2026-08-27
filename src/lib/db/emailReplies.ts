import { pool } from './pool'

export type EmailReplyMatchMethod = 'thread_id' | 'subject_fallback' | 'unmatched'

export interface EmailReplyInsert {
  gmail_message_id: string
  gmail_thread_id: string
  solicitud_id: string | null
  match_method: EmailReplyMatchMethod
  from_email: string
  received_at: string
}

export interface EmailReplyRow {
  id: string
  gmail_message_id: string
  gmail_thread_id: string
  solicitud_id: string | null
  match_method: EmailReplyMatchMethod
  from_email: string
  received_at: string
  notified: boolean
  created_at: string
}

// Inserta una respuesta detectada. Idempotente: gmail_message_id es UNIQUE, así
// que reprocesar una ventana de tiempo superpuesta (por diseño del polling, para
// no perder nada si el cron se saltea una corrida) nunca duplica nada — devuelve
// null si ese mensaje ya había sido procesado en una corrida anterior.
export async function insertEmailReply(input: EmailReplyInsert): Promise<EmailReplyRow | null> {
  const { rows } = await pool.query(
    `insert into email_replies (gmail_message_id, gmail_thread_id, solicitud_id, match_method, from_email, received_at)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (gmail_message_id) do nothing
     returning *`,
    [input.gmail_message_id, input.gmail_thread_id, input.solicitud_id, input.match_method, input.from_email, input.received_at]
  )
  return (rows[0] as EmailReplyRow) ?? null
}

export async function markEmailReplyNotified(id: string) {
  await pool.query(`update email_replies set notified = true where id = $1`, [id])
}
