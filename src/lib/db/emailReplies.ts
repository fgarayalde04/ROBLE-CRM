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

// ─── Bandeja de respuestas ───────────────────────────────────────────────────

export interface EmailReplyInboxRow {
  id: string
  gmail_thread_id: string
  from_email: string
  received_at: string
  subject: string | null
  snippet: string | null
  match_method: EmailReplyMatchMethod
  reviewed_at: string | null
  reviewed_by: string | null
  solicitud_uuid: string | null
  solicitud_id: string | null
  client_name: string | null
  asesor: string | null
  estado: string | null
}

// Respuestas más recientes primero. soloAsesor: solo las de órdenes de ese
// asesor (por id o, en órdenes viejas sin asesor_id, por nombre) — las que no
// se pudieron asociar a una orden solo las ve Mesa.
export async function listEmailRepliesInbox(opts: {
  soloAsesor: { id: string; name: string } | null
  pendientes: boolean
  limit: number
}): Promise<EmailReplyInboxRow[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.soloAsesor) {
    params.push(opts.soloAsesor.id, opts.soloAsesor.name)
    where.push(`(s.asesor_id = $${params.length - 1} or (s.asesor_id is null and s.asesor = $${params.length}))`)
  }
  if (opts.pendientes) where.push('e.reviewed_at is null')
  params.push(opts.limit)
  const { rows } = await pool.query(
    `select e.id, e.gmail_thread_id, e.from_email, e.received_at, e.subject, e.snippet, e.match_method,
            e.reviewed_at, e.reviewed_by,
            s.id as solicitud_uuid, s.solicitud_id, s.client_name, s.asesor, s.estado
       from email_replies e
       left join solicitudes s on s.id = e.solicitud_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by e.received_at desc
      limit $${params.length}`,
    params
  )
  return rows as EmailReplyInboxRow[]
}

export async function getEmailReplyAsesorId(id: string): Promise<{ exists: boolean; asesorId: string | null; asesor: string | null }> {
  const { rows } = await pool.query(
    `select s.asesor_id, s.asesor from email_replies e left join solicitudes s on s.id = e.solicitud_id where e.id = $1`,
    [id]
  )
  if (!rows[0]) return { exists: false, asesorId: null, asesor: null }
  return { exists: true, asesorId: rows[0].asesor_id ?? null, asesor: rows[0].asesor ?? null }
}

// reviewed=false la vuelve a dejar pendiente.
export async function setEmailReplyReviewed(id: string, reviewedBy: string | null) {
  await pool.query(
    `update email_replies set reviewed_at = case when $2::text is null then null else now() end, reviewed_by = $2 where id = $1`,
    [id, reviewedBy]
  )
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
