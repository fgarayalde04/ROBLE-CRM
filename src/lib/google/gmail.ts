// Gmail API helpers (v1)

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

export interface SendEmailInput {
  from: string          // sender email (must match connected account)
  to: string | string[] // recipient(s)
  cc?: string | string[]
  subject: string
  body: string          // plain text body
  replyTo?: string
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
}

/**
 * Encode a plain-text email as RFC 2822 base64url for Gmail API
 */
function encodeEmail(input: SendEmailInput): string {
  const toAddresses = Array.isArray(input.to) ? input.to.join(', ') : input.to
  const ccAddresses = input.cc
    ? Array.isArray(input.cc) ? input.cc.join(', ') : input.cc
    : null

  const lines = [
    `From: ${input.from}`,
    `To: ${toAddresses}`,
    ccAddresses ? `Cc: ${ccAddresses}` : null,
    input.replyTo ? `Reply-To: ${input.replyTo}` : null,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    input.body,
  ]
    .filter((l) => l !== null)
    .join('\r\n')

  // base64url encode
  return Buffer.from(lines).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Send an email via the Gmail API */
export async function sendEmail(
  accessToken: string,
  input: SendEmailInput
): Promise<GmailMessage> {
  const raw = encodeEmail(input)

  const res = await fetch(`${GMAIL_BASE}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const err = await res.text()
    const e: any = new Error(`Gmail send failed: ${err}`)
    e.status = res.status
    throw e
  }

  return res.json()
}

/** Create a Gmail draft */
export async function createDraft(
  accessToken: string,
  input: SendEmailInput
): Promise<{ id: string; message: GmailMessage }> {
  const raw = encodeEmail(input)

  const res = await fetch(`${GMAIL_BASE}/users/me/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gmail draft failed: ${err}`)
  }

  return res.json()
}

// ─── Inbox / read ─────────────────────────────────────────────────────────────

export interface InboxMessage {
  id: string
  threadId: string
  from: string       // "Name <email>" or just email
  fromName: string
  fromEmail: string
  subject: string
  snippet: string
  date: string       // ISO string
  isUnread: boolean
  isMarketRelated: boolean
}

const MARKET_KEYWORDS = [
  'mercado', 'bolsa', 'índice', 'indice', 's&p', 'nasdaq', 'dow jones',
  'rendimiento', 'tasa', 'inflación', 'inflacion', 'fed', 'reserva federal',
  'banco central', 'bcu', 'crypto', 'bitcoin', 'petróleo', 'petroleo',
  'dólar', 'dolar', 'euro', 'market', 'index', 'rate', 'yield', 'trading',
  'invest', 'portfolio', 'equity', 'bond', 'renta fija', 'acciones',
  'dividendo', 'ipo', 'fusión', 'adquisición', 'earnings', 'resultados',
  'análisis', 'research', 'outlook', 'forecast', 'tendencia',
]

function isMarketRelated(subject: string, fromEmail: string): boolean {
  const text = (subject + ' ' + fromEmail).toLowerCase()
  return MARKET_KEYWORDS.some((kw) => text.includes(kw))
}

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/)
  if (match) return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2].trim() }
  return { name: raw.trim(), email: raw.trim() }
}

function headerVal(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Fetch one message's metadata (asunto, remitente, fecha, threadId — nunca el cuerpo) */
export async function getInboxMessage(accessToken: string, id: string): Promise<(InboxMessage & { labelIds: string[] }) | null> {
  const msgRes = await fetch(
    `${GMAIL_BASE}/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
  )
  // 404: el mensaje ya no existe (borrado entre el aviso y la lectura) — no es un error.
  if (msgRes.status === 404) return null
  if (!msgRes.ok) {
    const e: any = new Error(`Gmail get message failed: ${await msgRes.text()}`)
    e.status = msgRes.status
    throw e
  }
  const msg = await msgRes.json()

  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []
  const fromRaw = headerVal(headers, 'From')
  const subject = headerVal(headers, 'Subject') || '(Sin asunto)'
  const dateRaw = headerVal(headers, 'Date')
  const { name: fromName, email: fromEmail } = parseFrom(fromRaw)
  const labelIds: string[] = msg.labelIds ?? []
  // Header Date como siempre; si viene vacío o ilegible, internalDate (la hora en que Gmail recibió el mensaje).
  const headerDate = dateRaw ? new Date(dateRaw) : null
  const received = headerDate && !Number.isNaN(headerDate.getTime())
    ? headerDate
    : new Date(msg.internalDate ? Number(msg.internalDate) : Date.now())

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: fromRaw,
    fromName,
    fromEmail,
    subject,
    snippet: msg.snippet ?? '',
    date: received.toISOString(),
    isUnread: labelIds.includes('UNREAD'),
    isMarketRelated: isMarketRelated(subject, fromEmail),
    labelIds,
  }
}

/** Internal: list + fetch metadata for inbox messages matching a Gmail search query */
async function listInboxByQuery(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<InboxMessage[]> {
  const listUrl = new URL(`${GMAIL_BASE}/users/me/messages`)
  listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', String(maxResults))

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!listRes.ok) {
    const err = await listRes.text()
    const e: any = new Error(`Gmail list failed: ${err}`)
    e.status = listRes.status
    throw e
  }

  const listData = await listRes.json()
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id)

  if (ids.length === 0) return []

  // Fetch metadata for each message in parallel (cap at 25)
  const messages = await Promise.all(
    ids.slice(0, 25).map((id) => getInboxMessage(accessToken, id).catch(() => null))
  )

  return messages.filter(Boolean) as InboxMessage[]
}

/** List today's inbox messages with metadata */
export async function listInboxToday(
  accessToken: string,
  maxResults = 30
): Promise<InboxMessage[]> {
  const now = new Date()
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  return listInboxByQuery(accessToken, `in:inbox after:${dateStr}`, maxResults)
}

/**
 * List inbox messages received after a given date (metadata only — asunto,
 * remitente, fecha, threadId — nunca el cuerpo completo). Generaliza
 * listInboxToday para el cron de detección de respuestas, que necesita mirar
 * una ventana de tiempo (no solo "hoy") para no perder respuestas si el cron
 * se saltea una corrida.
 */
export async function listInboxSince(
  accessToken: string,
  afterDate: Date,
  maxResults = 50
): Promise<InboxMessage[]> {
  const dateStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`
  return listInboxByQuery(accessToken, `in:inbox after:${dateStr}`, maxResults)
}

// ─── Push (Gmail watch + Pub/Sub) ─────────────────────────────────────────────
// Gmail avisa a un topic de Pub/Sub cuando cambia el buzón; Pub/Sub le pega a
// nuestro webhook al instante. El aviso solo trae un historyId — los mensajes
// nuevos se leen con history.list desde el último historyId ya procesado.

async function gmailJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  // cache: 'no-store' es clave: Next 14 guarda en su caché de datos los fetch
  // GET que no lo aclaran, y el chequeo periódico recibía siempre el mismo
  // historyId viejo — las respuestas recién aparecían al reiniciar la app (deploy).
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const e: any = new Error(`Gmail request failed (${res.status}): ${await res.text()}`)
    e.status = res.status
    throw e
  }
  return res.json()
}

/** Casilla a la que pertenece el token (emailAddress) y su historyId actual. */
export async function getMailboxProfile(accessToken: string): Promise<{ emailAddress: string; historyId: string }> {
  const profile = await gmailJson<{ emailAddress: string; historyId: string }>(accessToken, `${GMAIL_BASE}/users/me/profile`)
  return { emailAddress: profile.emailAddress, historyId: String(profile.historyId) }
}

/** historyId actual del buzón — punto de partida para "solo lo que llegue de ahora en más". */
export async function getMailboxHistoryId(accessToken: string): Promise<string> {
  const profile = await gmailJson<{ historyId: string }>(accessToken, `${GMAIL_BASE}/users/me/profile`)
  return String(profile.historyId)
}

/** Registra (o renueva) el watch de la bandeja de entrada. Vence a los 7 días como máximo. */
export async function watchInbox(accessToken: string, topicName: string): Promise<{ historyId: string; expiration: Date }> {
  const data = await gmailJson<{ historyId: string; expiration: string }>(
    accessToken,
    `${GMAIL_BASE}/users/me/watch`,
    { method: 'POST', body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }) }
  )
  return { historyId: String(data.historyId), expiration: new Date(Number(data.expiration)) }
}

/**
 * Ids de mensajes que llegaron a la bandeja de entrada después de startHistoryId,
 * y el historyId hasta el que se leyó. Lanza error con status 404 si Gmail ya
 * no guarda ese historial (demasiado viejo) — el llamador debe re-sembrar.
 */
export async function listInboxMessageIdsSince(
  accessToken: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; historyId: string }> {
  const ids = new Set<string>()
  let pageToken: string | undefined
  let historyId = startHistoryId

  do {
    const url = new URL(`${GMAIL_BASE}/users/me/history`)
    url.searchParams.set('startHistoryId', startHistoryId)
    url.searchParams.set('historyTypes', 'messageAdded')
    url.searchParams.set('labelId', 'INBOX')
    url.searchParams.set('maxResults', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const data = await gmailJson<{
      history?: Array<{ messagesAdded?: Array<{ message: { id: string; labelIds?: string[] } }> }>
      nextPageToken?: string
      historyId?: string
    }>(accessToken, url.toString())

    for (const h of data.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        // labelId=INBOX ya filtra, pero un mensaje que entra y sale de la
        // bandeja en el mismo tramo puede colarse — el labelIds del propio
        // evento es la referencia.
        if (added.message.labelIds?.includes('INBOX')) ids.add(added.message.id)
      }
    }
    if (data.historyId) historyId = String(data.historyId)
    pageToken = data.nextPageToken
  } while (pageToken)

  return { messageIds: Array.from(ids), historyId }
}

// ─── Email templates ──────────────────────────────────────────────────────────

export type EmailTemplate =
  | 'blank'
  | 'recordatorio_reunion'
  | 'seguimiento_apertura'
  | 'envio_documentos'
  | 'saludo_bienvenida'

export interface TemplateData {
  clientName?: string
  userName?: string
  date?: string
  time?: string
  subject?: string
  notes?: string
}

export function applyTemplate(
  template: EmailTemplate,
  data: TemplateData
): { subject: string; body: string } {
  const { clientName = '', userName = '', date = '', time = '', notes = '' } = data

  switch (template) {
    case 'recordatorio_reunion':
      return {
        subject: `Recordatorio de reunión${date ? ` - ${date}` : ''}`,
        body: [
          `Estimado/a ${clientName},`,
          '',
          `Le recordamos que tenemos una reunión programada${date ? ` para el ${date}` : ''}${time ? ` a las ${time}` : ''}.`,
          '',
          notes ? notes + '\n' : '',
          'Quedo a disposición ante cualquier consulta.',
          '',
          `Saludos cordiales,`,
          userName,
        ].join('\n'),
      }

    case 'seguimiento_apertura':
      return {
        subject: 'Seguimiento de apertura de cuenta',
        body: [
          `Estimado/a ${clientName},`,
          '',
          'Me comunico para hacer seguimiento del proceso de apertura de cuenta.',
          '',
          notes ? notes + '\n' : '',
          'Quedamos a disposición.',
          '',
          `Saludos,`,
          userName,
        ].join('\n'),
      }

    case 'envio_documentos':
      return {
        subject: 'Documentación solicitada',
        body: [
          `Estimado/a ${clientName},`,
          '',
          'Adjunto encontrará la documentación solicitada.',
          '',
          notes ? notes + '\n' : '',
          'Ante cualquier consulta, no dude en contactarnos.',
          '',
          `Saludos cordiales,`,
          userName,
        ].join('\n'),
      }

    case 'saludo_bienvenida':
      return {
        subject: 'Bienvenido/a a Roble Capital',
        body: [
          `Estimado/a ${clientName},`,
          '',
          'Es un placer darle la bienvenida a Roble Capital.',
          'Nos ponemos a su entera disposición para acompañarlo/a en sus objetivos de inversión.',
          '',
          notes ? notes + '\n' : '',
          `Saludos cordiales,`,
          userName,
          'Roble Capital',
        ].join('\n'),
      }

    default: // blank
      return { subject: '', body: '' }
  }
}
