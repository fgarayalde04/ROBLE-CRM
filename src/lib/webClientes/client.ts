// Web de clientes (repo RobleCapital: FastAPI + Next.js, en Railway). El CRM
// publica ahí los PDFs de Plantillas en la sección de research que corresponde,
// con la API del CRM (sin usuario, autenticada con una clave compartida):
//   POST   /api/v1/research/crm/documents        (multipart: file, section, subsection, title, description, published_date, publish)
//   DELETE /api/v1/research/crm/documents/{id}
//   WEB_CLIENTES_API_URL → URL del backend (ej. https://roblecapital-development.up.railway.app), sin /api/v1
//   WEB_CLIENTES_API_KEY → la CRM_API_KEY configurada en el backend de la web
// No hay endpoint para editar: actualizar = publicar el nuevo y borrar el anterior.

export interface SeccionWeb { section: string; subsection: string }

export function webClientesConfigurada() {
  return !!(process.env.WEB_CLIENTES_API_URL && process.env.WEB_CLIENTES_API_KEY)
}

function base() {
  return `${process.env.WEB_CLIENTES_API_URL!.replace(/\/+$/, '')}/api/v1/research/crm`
}

function headers() {
  return { 'X-API-Key': process.env.WEB_CLIENTES_API_KEY! }
}

async function borrarDocumento(id: string) {
  const res = await fetch(`${base()}/documents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() })
  // 404/422: ya no existe (o era de la API anterior): no hay nada que borrar
  if (!res.ok && res.status !== 404 && res.status !== 422) {
    // No es grave: queda la versión anterior publicada además de la nueva.
    console.error('[web-clientes] no se pudo borrar la versión anterior', id, res.status, await res.text())
  }
}

export interface ReporteWeb { reportId: string; filePath: string }

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

  const res = await fetch(`${base()}/documents`, { method: 'POST', headers: headers(), body: fd })
  if (!res.ok) throw new Error(`Web de clientes POST /documents → ${res.status}: ${await res.text()}`)
  const doc = await res.json()

  if (input.existente?.reportId && input.existente.reportId !== doc.id) await borrarDocumento(input.existente.reportId)
  return { reportId: doc.id, filePath: doc.file_path ?? '' }
}
