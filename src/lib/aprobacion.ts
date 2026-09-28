import { randomBytes } from 'crypto'

// Aprobación del cliente desde el mail de la orden: el mail lleva dos botones
// (Apruebo / No apruebo) que abren /aprobar/<token>, donde el cliente confirma
// y puede dejar un comentario. Abrir el link no registra nada — hay que tocar
// "Enviar" en la página, porque los filtros de spam abren los links solos.

export function newAprobacionToken(): string {
  return randomBytes(32).toString('hex')
}

export function isAprobacionToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// El texto original del mail, con los botones abajo (HTML) o el link (texto).
export function buildAprobacionEmail(body: string, baseUrl: string, token: string): { text: string; html: string } {
  const url = `${baseUrl.replace(/\/$/, '')}/aprobar/${token}`
  const text = `${body}\n\n—\nPara aprobar o rechazar esta orden, ingresá acá:\n${url}`

  const button = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;padding:12px 28px;margin:0 8px 8px 0;border-radius:8px;background:${bg};color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${label}</a>`

  const html = `<!doctype html><html><body style="margin:0;padding:0">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;max-width:640px">
<div style="white-space:pre-wrap">${escapeHtml(body)}</div>
<div style="margin-top:24px;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb">
<p style="margin:0 0 14px;font-weight:600;color:#2D3F52">¿Aprobás esta orden?</p>
${button(`${url}?r=si`, 'Apruebo', '#2E7D52')}${button(`${url}?r=no`, 'No apruebo', '#B42318')}
<p style="margin:10px 0 0;font-size:12px;color:#6b7280">Podés dejar un comentario antes de confirmar. También podés responder este mail.</p>
</div>
</div></body></html>`

  return { text, html }
}
