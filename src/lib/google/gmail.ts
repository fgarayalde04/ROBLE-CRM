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
    throw new Error(`Gmail send failed: ${err}`)
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

/** List today's inbox messages with metadata */
export async function listInboxToday(
  accessToken: string,
  maxResults = 30
): Promise<InboxMessage[]> {
  // Build date query: after:YYYY/MM/DD
  const now = new Date()
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`

  const listUrl = new URL(`${GMAIL_BASE}/users/me/messages`)
  listUrl.searchParams.set('q', `in:inbox after:${dateStr}`)
  listUrl.searchParams.set('maxResults', String(maxResults))

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!listRes.ok) {
    const err = await listRes.text()
    throw new Error(`Gmail list failed: ${err}`)
  }

  const listData = await listRes.json()
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id)

  if (ids.length === 0) return []

  // Fetch metadata for each message in parallel (cap at 25)
  const messages = await Promise.all(
    ids.slice(0, 25).map(async (id): Promise<InboxMessage | null> => {
      try {
        const msgRes = await fetch(
          `${GMAIL_BASE}/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!msgRes.ok) return null
        const msg = await msgRes.json()

        const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []
        const fromRaw = headerVal(headers, 'From')
        const subject = headerVal(headers, 'Subject') || '(Sin asunto)'
        const dateRaw = headerVal(headers, 'Date')
        const { name: fromName, email: fromEmail } = parseFrom(fromRaw)
        const isUnread = (msg.labelIds ?? []).includes('UNREAD')

        return {
          id: msg.id,
          threadId: msg.threadId,
          from: fromRaw,
          fromName,
          fromEmail,
          subject,
          snippet: msg.snippet ?? '',
          date: dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
          isUnread,
          isMarketRelated: isMarketRelated(subject, fromEmail),
        }
      } catch {
        return null
      }
    })
  )

  return messages.filter(Boolean) as InboxMessage[]
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
