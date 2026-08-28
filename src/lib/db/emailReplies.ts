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

// Punto de corte fijo: nunca se notifica una respuesta recibida antes de este
// momento, sin importar cuántos días hacia atrás mire la búsqueda de Gmail
// (que solo tiene granularidad de día, "after:YYYY/MM/DD" — no de hora). Esto
// evita que un reinicio, una desconexión temporal de la casilla de Mesa, o
// cualquier corte en el chequeo periódico dispare de golpe notificaciones de
// respuestas viejas cuando se retoma — solo avanza hacia adelante, nunca hacia
// atrás. Fila única, sembrada una sola vez (ver migración puntual).
export async function getEmailReplyCutoff(): Promise<Date> {
  try {
    const { rows } = await pool.query(`select cutoff_at from email_reply_check_cutoff where id = 1`)
    // Si por algún motivo no hay fila (tabla recién creada, nunca sembrada), el
    // default es "ahora" — nunca "desde siempre" — para no arriesgarse a mirar
    // hacia atrás si algo salió mal con la siembra inicial.
    return rows[0] ? new Date(rows[0].cutoff_at) : new Date()
  } catch {
    // Tabla inexistente u otro error — mismo criterio: fail-safe hacia "ahora".
    return new Date()
  }
}

// Heartbeat de diagnóstico: se llama en cada corrida (éxito o error) para
// poder ver desde la base, sin acceso a los logs de Railway, si el chequeo
// periódico realmente está corriendo cada 1 minuto como debería.
export async function recordCheckHeartbeat(status: string, error?: string | null) {
  try {
    await pool.query(
      `update email_reply_check_cutoff set last_checked_at = now(), last_status = $1, last_error = $2 where id = 1`,
      [status, error ?? null]
    )
  } catch {
    // best-effort — nunca debe tirar la corrida entera por esto
  }
}
