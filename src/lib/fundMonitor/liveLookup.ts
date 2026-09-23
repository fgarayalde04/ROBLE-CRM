import { getBrowser } from '@/lib/fondos/browser'
import { loginDavinci, searchFundReturns, openDavinciPage, type DavinciFundReturns } from '@/lib/fundMonitor/davinciScraper'

// Búsqueda puntual en Davinci para fondos que no están en el Monitor. No
// guarda nada en fund_monitor_*: el fondo no se da de alta en el Monitor por
// aparecer en una propuesta.
//
// Las consultas se encolan de a una (cada una abre un browser headless — varias
// en paralelo al cargar una propuesta con muchos fondos agotarían la memoria) y
// se cachean un rato en memoria, incluyendo los "no encontrado", para no volver
// a pegarle a Davinci por el mismo ISIN en cada recarga.
const TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; data: DavinciFundReturns | null }>()
let queue: Promise<unknown> = Promise.resolve()

export type LiveLookupResult =
  | { status: 'ok'; data: DavinciFundReturns }
  | { status: 'not_found' }
  | { status: 'unavailable' }

async function run(isin: string, nombre?: string): Promise<LiveLookupResult> {
  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) return { status: 'unavailable' }

  const key = isin.toUpperCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.data ? { status: 'ok', data: hit.data } : { status: 'not_found' }
  }

  try {
    const browser = await getBrowser()
    if (!browser) return { status: 'unavailable' }
    const { context, page } = await openDavinciPage(browser)
    try {
      await loginDavinci(page, email, password)
      const data = await searchFundReturns(page, isin, nombre)
      cache.set(key, { at: Date.now(), data })
      return data ? { status: 'ok', data } : { status: 'not_found' }
    } finally {
      await context.close()
    }
  } catch (e: any) {
    console.error('[fund-monitor] Error en la búsqueda en vivo en Davinci:', isin, e.message)
    return { status: 'unavailable' }
  }
}

export function lookupDavinciLive(isin: string, nombre?: string): Promise<LiveLookupResult> {
  const next = queue.then(() => run(isin, nombre), () => run(isin, nombre))
  queue = next
  return next
}
