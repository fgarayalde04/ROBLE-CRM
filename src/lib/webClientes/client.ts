// Web de clientes (repo RobleCapital: FastAPI + Next.js, en Railway). El CRM
// publica ahí los PDFs de Plantillas como "Reportes", usando la API de admin
// de la web con una cuenta de administrador dedicada:
//   WEB_CLIENTES_API_URL   → URL del backend (ej. https://xxx.up.railway.app), sin /api/v1
//   WEB_CLIENTES_EMAIL     → admin de la web (ej. crm@roblecapital.net)
//   WEB_CLIENTES_PASSWORD
// Publicar un reporte no le manda mail a los clientes (el resumen diario de la
// web no incluye reportes): solo aparece en su sección de Reportes.

const BUCKET = 'reports'

export function webClientesConfigurada() {
  return !!(process.env.WEB_CLIENTES_API_URL && process.env.WEB_CLIENTES_EMAIL && process.env.WEB_CLIENTES_PASSWORD)
}

function base() {
  return `${process.env.WEB_CLIENTES_API_URL!.replace(/\/+$/, '')}/api/v1`
}

let token: { value: string; exp: number } | null = null

async function login(force = false): Promise<string> {
  if (!force && token && token.exp > Date.now()) return token.value
  const res = await fetch(`${base()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.WEB_CLIENTES_EMAIL, password: process.env.WEB_CLIENTES_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login en la web de clientes falló (${res.status}): ${await res.text()}`)
  const data = await res.json()
  if (data?.user?.role !== 'admin') throw new Error('La cuenta configurada para la web de clientes no es administradora')
  // El access token dura 24 h en la web; se renueva antes por las dudas.
  token = { value: data.access_token, exp: Date.now() + 20 * 60 * 60 * 1000 }
  return token.value
}

async function api(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const t = await login()
  const res = await fetch(`${base()}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } })
  if (res.status === 401 && retry) {
    await login(true)
    return api(path, init, false)
  }
  if (!res.ok) throw new Error(`Web de clientes ${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function subirPdf(pdf: Buffer, nombre: string): Promise<{ file_path: string; file_url: string }> {
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), nombre)
  return api(`/upload/pdf?bucket=${BUCKET}`, { method: 'POST', body: fd })
}

async function borrarArchivo(filePath: string) {
  try {
    await api('/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket_name: BUCKET, file_path: filePath }),
    })
  } catch (err: any) {
    // No es grave: queda un PDF viejo huérfano en el storage de la web.
    console.error('[web-clientes] no se pudo borrar el PDF anterior', err.message)
  }
}

export interface ReporteWeb { reportId: string; filePath: string }

/**
 * Crea (o actualiza, si ya existe) el reporte en la web de clientes con el PDF
 * y lo deja publicado. Devuelve el id del reporte y la ruta del PDF.
 */
export async function publicarReporteWeb(input: {
  existente: ReporteWeb | null
  titulo: string
  descripcion: string | null
  pdf: Buffer
  nombreArchivo: string
}): Promise<ReporteWeb> {
  const archivo = await subirPdf(input.pdf, input.nombreArchivo)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
  const campos = {
    title: input.titulo.slice(0, 255),
    description: input.descripcion,
    file_url: archivo.file_url,
    file_path: archivo.file_path,
  }

  if (input.existente) {
    try {
      const r = await api(`/reports/${input.existente.reportId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos),
      })
      if (r?.status !== 'published') {
        await api(`/reports/${input.existente.reportId}/publish`, { method: 'PATCH' })
      }
      if (input.existente.filePath && input.existente.filePath !== archivo.file_path) await borrarArchivo(input.existente.filePath)
      return { reportId: input.existente.reportId, filePath: archivo.file_path }
    } catch (err: any) {
      // Si lo borraron a mano en la web, se crea de nuevo.
      if (!/→ 404/.test(err.message)) throw err
    }
  }

  const creado = await api('/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...campos, published_date: hoy }),
  })
  await api(`/reports/${creado.id}/publish`, { method: 'PATCH' })
  return { reportId: creado.id, filePath: archivo.file_path }
}
