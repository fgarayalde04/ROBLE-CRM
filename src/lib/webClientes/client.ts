// Web de clientes (repo RobleCapital: FastAPI + Next.js, en Railway). El CRM
// publica ahí los PDFs de Plantillas en la sección de research que corresponde,
// con la API del CRM (sin usuario, autenticada con una clave compartida):
//   POST   /api/v1/research/crm/documents        (multipart: file, section, subsection, title, description, published_date, publish)
//   DELETE /api/v1/research/crm/documents/{id}
//   GET    /api/v1/research/crm/clients          (clientes activos para avisar al publicar)
// Con notify_user_ids (ids de /clients) la web avisa por mail a esos clientes
// al publicar; cuántos avisó viene en el header X-Notified-Count.
//   WEB_CLIENTES_API_URL → URL del backend (ej. https://roblecapital-development.up.railway.app), sin /api/v1
//   WEB_CLIENTES_API_KEY → la CRM_API_KEY configurada en el backend de la web
// No hay endpoint para editar: actualizar = publicar el nuevo y borrar el anterior.

export type { SeccionWeb } from './secciones'
import type { SeccionWeb } from './secciones'

export function webClientesConfigurada() {
  return !!(process.env.WEB_CLIENTES_API_URL && process.env.WEB_CLIENTES_API_KEY)
}

function base() {
  return `${process.env.WEB_CLIENTES_API_URL!.replace(/\/+$/, '')}/api/v1/research/crm`
}

function headers() {
  return { 'X-API-Key': process.env.WEB_CLIENTES_API_KEY! }
}

/** Saca un documento de la web de clientes. Si ya no existe, no es error. */
export async function despublicarDocumentoWeb(id: string) {
  const res = await fetch(`${base()}/documents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() })
  if (!res.ok && res.status !== 404 && res.status !== 422) {
    throw new Error(`Web de clientes DELETE /documents → ${res.status}: ${await res.text()}`)
  }
}

async function borrarDocumento(id: string) {
  const res = await fetch(`${base()}/documents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() })
  // 404/422: ya no existe (o era de la API anterior): no hay nada que borrar
  if (!res.ok && res.status !== 404 && res.status !== 422) {
    // No es grave: queda la versión anterior publicada además de la nueva.
    console.error('[web-clientes] no se pudo borrar la versión anterior', id, res.status, await res.text())
  }
}

export interface ReporteWeb { reportId: string; filePath: string; avisados?: number }

export interface ClienteWeb { id: string; nombre: string; email: string; cuentas: string[] }

/**
 * Clientes activos de la web, para elegir a quién avisar al publicar. Devuelve
 * null si la web todavía no tiene el endpoint (versión anterior del backend).
 */
export async function listarClientesWeb(): Promise<ClienteWeb[] | null> {
  const res = await fetch(`${base()}/clients`, { headers: headers(), cache: 'no-store' })
  if (res.status === 404 || res.status === 405) return null
  if (!res.ok) throw new Error(`Web de clientes GET /clients → ${res.status}: ${await res.text()}`)
  const rows: any[] = await res.json()
  return rows.map((u) => ({
    id: String(u.id),
    nombre: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email,
    email: u.email,
    cuentas: Array.isArray(u.client_codes) ? u.client_codes.map(String) : [],
  }))
}

/**
 * Publica el PDF en la sección de la web de clientes. Si ya había una
 * publicación de este documento, la reemplaza (se borra después de publicar la
 * nueva, así la web nunca queda sin el documento). Devuelve el id nuevo.
 */
export async function publicarReporteWeb(input: {
  existente: ReporteWeb | null
  seccion: SeccionWeb
  titulo: string
  descripcion: string | null
  pdf: Buffer
  nombreArchivo: string
  /** Clientes de la web (ids de listarClientesWeb) a avisar por mail */
  notificar?: string[]
}): Promise<ReporteWeb> {
  if (input.pdf.length > 10 * 1024 * 1024) throw new Error('El PDF pesa más de 10 MB (límite de la web de clientes)')
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(input.pdf)], { type: 'application/pdf' }), input.nombreArchivo)
  fd.append('section', input.seccion.section)
  fd.append('subsection', input.seccion.subsection)
  fd.append('title', input.titulo.slice(0, 255))
  if (input.descripcion) fd.append('description', input.descripcion)
  fd.append('published_date', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' }))
  fd.append('publish', 'true')
  for (const id of input.notificar ?? []) fd.append('notify_user_ids', id)

  const res = await fetch(`${base()}/documents`, { method: 'POST', headers: headers(), body: fd })
  if (!res.ok) throw new Error(`Web de clientes POST /documents → ${res.status}: ${await res.text()}`)
  const doc = await res.json()

  if (input.existente?.reportId && input.existente.reportId !== doc.id) await borrarDocumento(input.existente.reportId)
  const avisados = Number(res.headers.get('x-notified-count') ?? 0) || 0
  return { reportId: doc.id, filePath: doc.file_path ?? '', avisados }
}
