import { randomInt } from 'crypto'

// Aprobación del cliente directo desde el mail de la orden. Los links
// "Confirmo la orden" / "Prefiero no avanzar" son mailto: abren en el programa de mail del
// cliente una respuesta ya armada a trading@ (con copia al asesor), donde puede
// escribir comentarios antes de enviarla. Esa respuesta la lee el chequeo de la
// casilla de Mesa (processMesaInbox) y actualiza el estado de la orden.
// No hay ninguna página: el cliente nunca sale de su mail.

// Sin 0/O ni 1/I para que no se confundan si alguien la copia a mano.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newAprobacionToken(): string {
  let ref = ''
  for (let i = 0; i < 8; i++) ref += REF_ALPHABET[randomInt(REF_ALPHABET.length)]
  return ref
}

export function isAprobacionToken(token: string): boolean {
  return new RegExp(`^[${REF_ALPHABET}]{8}$`).test(token)
}

const REF_LABEL = 'Código de confirmación'
// Rótulos que se reconocen al leer la respuesta: el actual y el anterior
// ("Ref. orden"), para los mails que ya salieron con ese texto.
const REF_LABEL_RE = String.raw`(?:C[oó]digo\s+de\s+confirmaci[oó]n|Ref\.?\s*orden)`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function mailtoLink(to: string, cc: string | null, subject: string, body: string): string {
  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`]
  if (cc) params.unshift(`cc=${encodeURIComponent(cc)}`)
  return `mailto:${to}?${params.join('&')}`
}

// Separa, en la respuesta armada por los botones, lo que escribe el cliente del
// detalle de la orden que va debajo (para que lo vea mientras responde).
export const DETALLE_MARKER = '----- Detalle de la orden -----'

// Algunos programas de mail (Outlook en Windows) cortan los links mailto muy
// largos: el detalle dentro de la respuesta se acota. El mail original lo
// tiene siempre completo.
const DETALLE_EN_RESPUESTA_MAX = 1500

// Frases de la respuesta armada por los links (y las que se reconocen al leerla).
const FRASE_SI = 'Confirmo la orden'
const FRASE_NO = 'Prefiero no avanzar'

// El mail de la orden: el detalle completo y, al pie, una línea discreta con
// dos links que arman la respuesta.
export function buildAprobacionEmail(opts: {
  body: string
  subject: string
  replyTo: string          // casilla de Mesa (trading@)
  asesorEmail: string | null
  ref: string
}): { text: string; html: string } {
  const replySubject = `Re: ${opts.subject}`
  const cc = opts.asesorEmail && opts.asesorEmail.toLowerCase() !== opts.replyTo.toLowerCase() ? opts.asesorEmail : null
  const detalle = opts.body.length > DETALLE_EN_RESPUESTA_MAX
    ? `${opts.body.slice(0, DETALLE_EN_RESPUESTA_MAX).trimEnd()}\r\n[…ver el detalle completo en el mail original]`
    : opts.body
  // La referencia va arriba: es lo que la app lee para saber de qué orden se trata.
  const draft = (decision: string) =>
    `${decision}\r\n${REF_LABEL}: ${opts.ref}\r\n\r\nComentarios:\r\n\r\n\r\n\r\n${DETALLE_MARKER}\r\n${detalle.replace(/\r?\n/g, '\r\n')}`
  const aprueboHref = mailtoLink(opts.replyTo, cc, replySubject, draft(FRASE_SI))
  const noAprueboHref = mailtoLink(opts.replyTo, cc, replySubject, draft(FRASE_NO))

  const text = `${opts.body}\n\n—\nPara agilizar su respuesta, puede contestar este mail con "${FRASE_SI}" o "${FRASE_NO}".\n${REF_LABEL}: ${opts.ref}`

  // Discreto: una línea chica al pie del mail, sin cuadro ni botones.
  const link = (href: string, label: string, color: string) =>
    `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:underline">${label}</a>`
  const html = `<!doctype html><html><body style="margin:0;padding:0">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;max-width:640px">
<div style="white-space:pre-wrap">${escapeHtml(opts.body)}</div>
<div style="margin:24px 0 0;padding:12px 0 0;border-top:1px solid #eef0f2;font-size:12px;color:#9ca3af">
Para agilizar su respuesta: ${link(aprueboHref, FRASE_SI, '#2E7D52')} &nbsp;·&nbsp; ${link(noAprueboHref, FRASE_NO, '#6b7280')}
<br><span style="font-size:11px">${REF_LABEL}: ${opts.ref}</span>
</div>
</div></body></html>`

  return { text, html }
}

// ── Lectura de la respuesta ───────────────────────────────────────────────────

/** Código de la orden dentro de la respuesta ("Código de confirmación: ABCD2345"), si está. */
export function extractAprobacionRef(text: string): string | null {
  const m = new RegExp(`${REF_LABEL_RE}\\s*:?\\s*([${REF_ALPHABET}]{8})\\b`, 'i').exec(text)
  return m ? m[1].toUpperCase() : null
}

/**
 * ¿La respuesta aprueba o rechaza? Solo mira el comienzo de lo que escribió el
 * cliente (sin la cita del mail original), así un "apruebo" perdido en el medio
 * de otro texto no cuenta. Devuelve también el comentario, sin la palabra
 * clave ni la referencia.
 */
export function parseAprobacion(replyText: string): { decision: 'aprobada' | 'rechazada'; comentario: string | null } | null {
  const text = replyText.trim()
  let decision: 'aprobada' | 'rechazada' | null = null
  let rest = text
  // Frases actuales ("Confirmo la orden" / "Prefiero no avanzar") y las de los
  // mails anteriores o escritas a mano ("Apruebo" / "No apruebo").
  const no = /^(no\s+(apruebo|aprobado|confirmo\s+la\s+orden)|prefiero\s+no\s+avanzar(\s+con\s+la\s+orden)?)\b[.!,:]*/i.exec(text)
  const si = /^(apruebo|aprobado|confirmo\s+la\s+orden)\b[.!,:]*/i.exec(text)
  if (no) { decision = 'rechazada'; rest = text.slice(no[0].length) }
  else if (si) { decision = 'aprobada'; rest = text.slice(si[0].length) }
  if (!decision) return parseRespuestaLibre(text)

  const comentario = rest
    .split(DETALLE_MARKER)[0]
    .replace(new RegExp(`${REF_LABEL_RE}\\s*:?\\s*[${REF_ALPHABET}]{8}\\b`, 'i'), '')
    .replace(/^\s*Comentarios?\s*:\s*/i, '')
    .replace(/\s*Comentarios?\s*:\s*$/i, '')
    .trim()
  return { decision, comentario: comentario || null }
}

// ── Respuestas escritas a mano ("Confirmado", "Ok, adelante", "No, gracias") ──
// Muchos clientes tocan "Responder" y escriben ellos. Se reconoce solo una
// respuesta corta y clara; ante la mínima duda (una pregunta, un "pero", un
// número, un cambio) devuelve null y la respuesta queda para que la lea el equipo.

const SI_LIBRE = [
  'confirmado', 'confirmada', 'confirmo', 'conforme', 'aprobado', 'aprobada', 'apruebo',
  'autorizado', 'autorizada', 'autorizo', 'de acuerdo', 'ok', 'okey', 'okay', 'oka', 'dale',
  'adelante', 'perfecto', 'perfecta', 'correcto', 'procedan', 'proceder', 'proceda',
  'todo bien', 'está bien', 'esta bien', 'sin problema', 'no hay problema', 'sí', 'si',
  'claro', 'excelente', 'genial',
]
const NO_LIBRE = [
  'no', 'mejor no', 'no gracias', 'prefiero no avanzar', 'prefiero no', 'prefiero esperar',
  'no avanzar', 'no avancen', 'no proceder', 'no procedan', 'no confirmo', 'no autorizo',
  'no apruebo', 'cancelar', 'cancelen', 'cancelala',
]
const FRASES_LIBRES = [
  ...SI_LIBRE.map((f) => ({ f, decision: 'aprobada' as const })),
  ...NO_LIBRE.map((f) => ({ f, decision: 'rechazada' as const })),
].sort((a, b) => b.f.length - a.f.length)   // la más larga primero: "no hay problema" antes que "no"

// Lo que puede seguir a la palabra clave sin que cambie el sentido
const SIGUE_OK = /^(gracias|muchas|mil|adelante|dale|ok|perfecto|saludos|slds|por favor|la orden|la operaci[oó]n|la compra|la venta|confirm|de acuerdo|claro|procedan|abrazo|atte|atentamente|cordialmente|un saludo|buen|quedo|enviado desde|s[ií]\b)/i
const SALUDO_INICIAL = /^(hola|buen(os|as)?\s+(d[ií]as?|tardes|noches)|buenas)[\s,.!]*/i
const FIRMA = /\b(gracias|saludos|slds|abrazo|atte|atentamente|cordialmente|enviado desde)\b/i
const DUDA = /\?|\d|\b(pero|cambi\w*|modific\w*|en vez|en lugar|solo|sólo|salvo|excepto|menos|mitad|hasta|llam\w*|consult\w*|duda\w*)\b/i

function parseRespuestaLibre(text: string): { decision: 'aprobada' | 'rechazada'; comentario: string | null } | null {
  const t = text.replace(SALUDO_INICIAL, '')
  const lower = t.toLowerCase()
  const hit = FRASES_LIBRES.find(({ f }) => lower.startsWith(f) && !/[\p{L}\d]/u.test(t.charAt(f.length)))
  if (!hit) return null

  const after = t.slice(hit.f.length)
  const afterTrim = after.replace(/^[\s.,!:;]+/, '')
  const sigueBien = afterTrim === '' || /^[.,!:;]/.test(after) || SIGUE_OK.test(afterTrim) || /^\p{Lu}/u.test(afterTrim)
  if (!sigueBien) return null   // "Confirmo que recibí…", "Si podés…", "No sé…"

  const cuerpo = afterTrim.split(FIRMA)[0].replace(/[\s.,!:;]+$/, '').trim()
  if (DUDA.test(cuerpo) || cuerpo.split(/\s+/).length > 12) return null
  return { decision: hit.decision, comentario: afterTrim.trim() || null }
}
