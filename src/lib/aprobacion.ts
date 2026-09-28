import { randomInt } from 'crypto'

// Aprobación del cliente directo desde el mail de la orden. Los botones
// "Apruebo" / "No apruebo" son links mailto: abren en el programa de mail del
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

const REF_LABEL = 'Ref. orden'

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

// El mail de la orden: botones Apruebo / No apruebo arriba (bien visibles),
// el detalle completo de la orden, y los botones de nuevo al final.
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
  const aprueboHref = mailtoLink(opts.replyTo, cc, replySubject, draft('APRUEBO'))
  const noAprueboHref = mailtoLink(opts.replyTo, cc, replySubject, draft('NO APRUEBO'))

  const instrucciones = 'Para aprobar esta orden respondé este mail con la palabra APRUEBO; para rechazarla, con NO APRUEBO. Podés agregar comentarios debajo.'
  const text = `${instrucciones}\n\n${opts.body}\n\n—\n${instrucciones}\n${REF_LABEL}: ${opts.ref}`

  const button = (href: string, label: string, bg: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;margin:0 8px 8px 0;border-radius:8px;background:${bg};color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${label}</a>`
  const bloque = (titulo: string) => `<div style="padding:18px 20px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb">
<p style="margin:0 0 12px;font-weight:600;color:#2D3F52">${titulo}</p>
${button(aprueboHref, 'Apruebo', '#2E7D52')}${button(noAprueboHref, 'No apruebo', '#B42318')}
<p style="margin:8px 0 0;font-size:12px;color:#6b7280">Al tocar un botón se abre tu respuesta con el detalle de la orden, lista para enviar. Podés agregar comentarios. También podés responder este mail escribiendo APRUEBO o NO APRUEBO.</p>
</div>`

  const html = `<!doctype html><html><body style="margin:0;padding:0">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;max-width:640px">
${bloque('¿Aprobás esta orden?')}
<div style="margin:20px 0;white-space:pre-wrap">${escapeHtml(opts.body)}</div>
${bloque('Confirmá tu respuesta')}
<p style="margin:10px 0 0;font-size:11px;color:#9ca3af">${REF_LABEL}: ${opts.ref}</p>
</div></body></html>`

  return { text, html }
}

// ── Lectura de la respuesta ───────────────────────────────────────────────────

/** Referencia de la orden dentro de la respuesta ("Ref. orden: ABCD2345"), si está. */
export function extractAprobacionRef(text: string): string | null {
  const m = new RegExp(`Ref\\.?\\s*orden\\s*:?\\s*([${REF_ALPHABET}]{8})\\b`, 'i').exec(text)
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
  const no = /^no\s+(apruebo|aprobado)\b[.!,:]*/i.exec(text)
  const si = /^(apruebo|aprobado)\b[.!,:]*/i.exec(text)
  if (no) { decision = 'rechazada'; rest = text.slice(no[0].length) }
  else if (si) { decision = 'aprobada'; rest = text.slice(si[0].length) }
  if (!decision) return null

  const comentario = rest
    .split(DETALLE_MARKER)[0]
    .replace(new RegExp(`Ref\\.?\\s*orden\\s*:?\\s*[${REF_ALPHABET}]{8}\\b`, 'i'), '')
    .replace(/^\s*Comentarios?\s*:\s*/i, '')
    .replace(/\s*Comentarios?\s*:\s*$/i, '')
    .trim()
  return { decision, comentario: comentario || null }
}
