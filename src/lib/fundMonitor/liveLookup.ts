import type { BrowserContext, Page } from 'playwright-core'
import { getBrowser } from '@/lib/fondos/browser'
import { loginDavinci, searchFundReturns, openDavinciPage, type DavinciFundReturns } from '@/lib/fundMonitor/davinciScraper'
import { getLookupCache, setLookupCache } from '@/lib/db/fundMonitor'
import { vigente } from '@/lib/fundMonitor/cortes'

// Búsqueda puntual en Davinci para fondos que no están en el Monitor. No
// guarda nada en fund_monitor_*: el fondo no se da de alta en el Monitor por
// aparecer en una propuesta.
//
// Para no multiplicar las descargas en Davinci:
//  - El resultado se guarda en la base (davinci_lookup_cache) y se usa durante
//    15 días, igual que los datos del Monitor; los "no encontrado" también.
//    Antes era un cache en memoria de 15 minutos que se perdía en cada deploy.
//  - La sesión de Davinci queda abierta y se reutiliza entre búsquedas (un
//    login, no uno por fondo); se cierra sola tras unos minutos sin uso.
//  - Si el login falla, no se vuelve a intentar por un rato (Davinci bloquea
//    la cuenta ante logins repetidos).
//
// Las consultas se encolan de a una: varias en paralelo al cargar una
// propuesta con muchos fondos agotarían la memoria del browser headless.
const SESSION_IDLE_MS = 10 * 60 * 1000
const LOGIN_COOLDOWN_MS = 60 * 60 * 1000
const ERROR_COOLDOWN_MS = 10 * 60 * 1000

let queue: Promise<unknown> = Promise.resolve()
let session: { context: BrowserContext; page: Page } | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let loginBlockedUntil = 0

export type LiveLookupResult =
  | { status: 'ok'; data: DavinciFundReturns }
  | { status: 'not_found' }
  | { status: 'unavailable' }

async function closeSession() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const s = session
  session = null
  await s?.context.close().catch(() => {})
}

async function getSession(email: string, password: string): Promise<Page | null> {
  if (session && !session.page.isClosed() && session.context.browser()?.isConnected()) return session.page
  await closeSession()
  if (Date.now() < loginBlockedUntil) return null

  const browser = await getBrowser()
  if (!browser) return null
  const s = await openDavinciPage(browser)
  try {
    await loginDavinci(s.page, email, password)
  } catch (e) {
    await s.context.close().catch(() => {})
    loginBlockedUntil = Date.now() + LOGIN_COOLDOWN_MS
    throw e
  }
  session = s
  return s.page
}

async function readCache(key: string): Promise<LiveLookupResult | null> {
  const hit = await getLookupCache(key).catch(() => null)
  if (!hit) return null
  if (!vigente(hit.fetched_at)) return null
  return hit.data ? { status: 'ok', data: hit.data as DavinciFundReturns } : { status: 'not_found' }
}

async function run(isin: string, nombre?: string): Promise<LiveLookupResult> {
  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) return { status: 'unavailable' }

  const key = isin.toUpperCase()
  const cached = await readCache(key)
  if (cached) return cached

  try {
    const page = await getSession(email, password)
    if (!page) return { status: 'unavailable' }
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { queue = queue.then(closeSession, closeSession) }, SESSION_IDLE_MS)

    const data = await searchFundReturns(page, isin, nombre)
    await setLookupCache(key, data).catch(e => console.error('[fund-monitor] No se pudo guardar la búsqueda en vivo:', e.message))
    return data ? { status: 'ok', data } : { status: 'not_found' }
  } catch (e: any) {
    // Sesión caída o página en un estado raro: se cierra, y por unos minutos no
    // se abre otra — si no, cada fondo de la propuesta haría su propio login.
    console.error('[fund-monitor] Error en la búsqueda en vivo en Davinci:', isin, e.message)
    await closeSession()
    loginBlockedUntil = Math.max(loginBlockedUntil, Date.now() + ERROR_COOLDOWN_MS)
    return { status: 'unavailable' }
  }
}

export async function lookupDavinciLive(isin: string, nombre?: string): Promise<LiveLookupResult> {
  // Lo guardado se responde sin esperar la cola; run() vuelve a mirar por si
  // una búsqueda anterior en la cola ya trajo el mismo ISIN.
  const cached = await readCache(isin.toUpperCase())
  if (cached) return cached
  const next = queue.then(() => run(isin, nombre), () => run(isin, nombre))
  queue = next
  return next
}
