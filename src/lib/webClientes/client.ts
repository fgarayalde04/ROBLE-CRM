// Web de clientes (repo RobleCapital: FastAPI + Next.js, en Railway). El CRM
// publica ahí los PDFs de Plantillas en la sección "Renta fija" (subsecciones
// Nuevas emisiones / Análisis de bonos), usando la API de admin de la web con
// una cuenta de administrador dedicada. Contrato de la API: docs/web-renta-fija-api.md.
//   WEB_CLIENTES_API_URL   → URL del backend (ej. https://xxx.up.railway.app), sin /api/v1
//   WEB_CLIENTES_EMAIL     → usuario admin o director de la web
//   WEB_CLIENTES_PASSWORD

const BUCKET = 'fixed-income'
const RECURSO = '/fixed-income'

export type CategoriaRentaFija = 'nuevas_emisiones' | 'analisis_bonos'

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
  if (!['admin', 'director'].includes(data?.user?.role)) throw new Error('La cuenta configurada para la web de clientes no es administradora ni directora')
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

export interface DatosBonoWeb {
  issuer?: string | null
  isin?: string | null
  coupon?: string | null
  maturity?: string | null
  price?: string | null
  yield_value?: string | null
  rating?: string | null
}

/**
 * Crea (o actualiza, si ya existe) la publicación en Renta fija de la web de
 * clientes con el PDF y la deja publicada. Devuelve su id y la ruta del PDF.
 */
export async function publicarReporteWeb(input: {
  existente: ReporteWeb | null
  categoria: CategoriaRentaFija
  titulo: string
  descripcion: string | null
  bono: DatosBonoWeb
  pdf: Buffer
  nombreArchivo: string
}): Promise<ReporteWeb> {
  const archivo = await subirPdf(input.pdf, input.nombreArchivo)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })
  const campos = {
    title: input.titulo.slice(0, 255),
    description: input.descripcion,
    category: input.categoria,
    ...input.bono,
    file_url: archivo.file_url,
    file_path: archivo.file_path,
  }

  if (input.existente) {
    try {
      const r = await api(`${RECURSO}/${input.existente.reportId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos),
      })
      if (r?.status !== 'published') {
        await api(`${RECURSO}/${input.existente.reportId}/publish`, { method: 'PATCH' })
      }
      if (input.existente.filePath && input.existente.filePath !== archivo.file_path) await borrarArchivo(input.existente.filePath)
      return { reportId: input.existente.reportId, filePath: archivo.file_path }
    } catch (err: any) {
      // Si lo borraron a mano en la web, se crea de nuevo.
      if (!/→ 404/.test(err.message)) throw err
    }
  }

  const creado = await api(RECURSO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...campos, published_date: hoy }),
  })
  await api(`${RECURSO}/${creado.id}/publish`, { method: 'PATCH' })
  return { reportId: creado.id, filePath: archivo.file_path }
}
