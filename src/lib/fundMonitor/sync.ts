/**
 * Lógica de sincronización del Monitor de Fondos (fuente: Davinci) — vive
 * acá, separada de la ruta /api/cron/fund-monitor-sync, porque además del
 * disparo manual por HTTP también corre desde instrumentation.ts: la app
 * está desplegada en Railway (proceso persistente), no en Vercel, y
 * vercel.json define este cron con la sintaxis de Vercel — que Railway
 * simplemente ignora. Sin esta segunda vía, la sincronización automática
 * nunca se ejecuta.
 */
import { getBrowser } from '@/lib/fondos/browser'
import { loginDavinci, searchFundReturns, openDavinciPage, type DavinciFundReturns } from '@/lib/fundMonitor/davinciScraper'
import {
  listActiveFunds, upsertFundReturns, markFundSyncIssue, getSyncState, markSyncAttempt, setLookupCache, getReturnsFetched, getLookupCaches,
} from '@/lib/db/fundMonitor'
import { CONFIABLE_DESDE, fechaMontevideo, proximoCorte, ultimoCorte, vigente } from '@/lib/fundMonitor/cortes'
import { claveNombreDavinci, getRankingMasOperado, mismoFondo } from '@/lib/db/masOperado'

// vigente: no se bajó en esta corrida, se usó lo guardado (menos de 15 días)
export interface FundSyncRowResult { isin: string; nombre: string; status: 'ok' | 'no_source' | 'error'; error?: string; vigente?: boolean }
export interface FundSyncResult {
  total: number; ok: number; no_source: number; error: number; vigentes: number; results: FundSyncRowResult[]
  // Fondos operados (lo más operado) que no están en el Monitor: buscados y encontrados en esta corrida
  operados?: { buscados: number; encontrados: number }
}
export interface FundSyncSkipped { skipped: true; reason: string }

// Davinci reportó ~50 mil descargas por día desde nuestro usuario. Reglas:
//  - Un dato bajado se usa durante 15 días (DIAS_VIGENCIA); no se vuelve a
//    buscar lo que tiene menos de 15 días, venga del sync, de Propuestas o de
//    un alta en el Monitor.
//  - El sync corre en dos cortes por mes, el 15 y el último día (Montevideo),
//    y baja los fondos del Monitor y los operados (lo más operado, comprados y
//    vendidos) que están vencidos o nunca se buscaron, con el mismo login.
//    Quedan guardados para Propuestas y las planillas. Si no hay nada vencido
//    no se loguea. Los demás fondos se buscan solo cuando hacen falta
//    (Propuestas, si no están en la base).
//  - Un solo login por corrida. Un intento fallido no se reintenta hasta el
//    día siguiente (Davinci bloquea la cuenta ante logins repetidos).
// Las fechas se guardan en la base (davinci_sync_state y fetched_at), no en
// memoria, así un deploy no dispara nada. ?force=1 saltea el calendario, pero
// igual respeta los 15 días de cada dato.
const SYNC_KEY = 'fund_monitor'
const DAY_MS = 24 * 60 * 60 * 1000

const aReturns = (d: DavinciFundReturns) => ({
  as_of_date: d.asOfDate, r_ytd: d.ytd, r_1y: d.r1a, r_3y: d.r3a, r_5y: d.r5a,
  y_2025: d.y2025, y_2024: d.y2024, y_2023: d.y2023, y_2022: d.y2022, y_2021: d.y2021,
})

export async function syncFundMonitor(opts?: { force?: boolean }): Promise<FundSyncResult | FundSyncSkipped> {
  const force = opts?.force ?? false
  const hoy = fechaMontevideo()
  if (!force) {
    const state = await getSyncState(SYNC_KEY)
    const now = Date.now()
    // Un sync anterior a la lectura corregida no cuenta: se corre de nuevo
    const ultimoValido = state.last_success_at && state.last_success_at.getTime() >= CONFIABLE_DESDE
    if (ultimoValido && fechaMontevideo(state.last_success_at!) >= ultimoCorte(hoy)) {
      return { skipped: true, reason: `last sync ${state.last_success_at!.toISOString()} (next on ${proximoCorte(hoy)})` }
    }
    if (state.last_attempt_at && now - state.last_attempt_at.getTime() < DAY_MS) {
      return { skipped: true, reason: `last attempt failed ${state.last_attempt_at.toISOString()}, retry tomorrow` }
    }
  }

  const funds = await listActiveFunds()
  const results: FundSyncRowResult[] = []

  // Lo que ya está guardado: Monitor (fund_monitor_returns) y búsquedas
  // hechas desde Propuestas o el reporte (davinci_lookup_cache).
  const guardado = await getReturnsFetched()
  const cache = await getLookupCaches(funds.map((f) => f.isin ?? '').filter(Boolean))

  const fondosABajar: typeof funds = []
  for (const fund of funds) {
    const g = guardado.get(fund.id)
    if (g && g.status !== 'error' && vigente(g.fetched_at, hoy)) {
      results.push({ isin: fund.isin, nombre: fund.nombre, status: g.status === 'ok' ? 'ok' : 'no_source', vigente: true })
      continue
    }
    const c = cache.get((fund.isin ?? '').toUpperCase())
    if (c?.data && vigente(c.fetched_at, hoy)) {
      // Ya se bajó desde Propuestas o el reporte hace menos de 15 días: se usa eso
      await upsertFundReturns(fund.id, aReturns(c.data), c.fetched_at)
      results.push({ isin: fund.isin, nombre: fund.nombre, status: 'ok', vigente: true })
      continue
    }
    fondosABajar.push(fund)
  }

  // Fondos operados que no están en el Monitor y no tienen una búsqueda vigente
  let operados: { nombre: string; claves: string[] }[] = []
  try {
    operados = await operadosABuscar(hoy)
  } catch (e: any) {
    console.error('[fund-monitor] No se pudieron leer los fondos operados:', e.message)
  }
  const op = { buscados: 0, encontrados: 0 }

  const resultado = (): FundSyncResult => ({
    total: funds.length,
    ok: results.filter(r => r.status === 'ok').length,
    no_source: results.filter(r => r.status === 'no_source').length,
    error: results.filter(r => r.status === 'error').length,
    vigentes: results.filter(r => r.vigente).length,
    results,
    operados: op,
  })

  if (!fondosABajar.length && !operados.length) {
    await markSyncAttempt(SYNC_KEY, true)
    return resultado()
  }

  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) {
    throw new Error('Faltan DAVINCI_EMAIL / DAVINCI_PASSWORD en el entorno')
  }

  const browser = await getBrowser()
  if (!browser) {
    throw new Error('No se pudo iniciar el browser headless')
  }

  // Se registra el intento antes de loguear: si el login falla o el proceso
  // se corta a mitad (ej. un deploy), no se vuelve a correr hasta mañana.
  await markSyncAttempt(SYNC_KEY, false)

  const { context, page } = await openDavinciPage(browser)
  try {
    await loginDavinci(page, email, password)

    for (const fund of fondosABajar) {
      try {
        const data = await searchFundReturns(page, fund.isin, fund.nombre)
        if (data && data.nombreDavinci && !mismoFondo(fund.nombre, data.nombreDavinci)) {
          // Otro fondo: se borran los valores (pueden ser de otro fondo también) y queda anotado
          console.warn(`[fund-monitor] Davinci devolvió otro fondo para ${fund.isin}: "${data.nombreDavinci}" (se buscaba "${fund.nombre}")`)
          await upsertFundReturns(fund.id, aReturns({ ...data, ytd: null, r1a: null, r3a: null, r5a: null, y2025: null, y2024: null, y2023: null, y2022: null, y2021: null, asOfDate: null }))
          await markFundSyncIssue(fund.id, 'no_source', `Davinci devolvió otro fondo ("${data.nombreDavinci}"): revisar ISIN o nombre`)
          results.push({ isin: fund.isin, nombre: fund.nombre, status: 'no_source' })
          continue
        }
        if (!data) {
          console.warn(`[fund-monitor] Sin fuente: ${fund.isin} · ${fund.nombre}`)
          await markFundSyncIssue(fund.id, 'no_source', 'Fondo no encontrado en Davinci (ni por ISIN ni por nombre)')
          results.push({ isin: fund.isin, nombre: fund.nombre, status: 'no_source' })
          continue
        }
        await upsertFundReturns(fund.id, aReturns(data))
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'ok' })
      } catch (e: any) {
        // Un fondo que falla no corta el resto de la corrida — se registra
        // el error y se sigue con el próximo.
        console.error(`[fund-monitor] Error: ${fund.isin} · ${fund.nombre}:`, e.message)
        await markFundSyncIssue(fund.id, 'error', e.message ?? 'Error desconocido')
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'error', error: e.message })
      }
    }

    // Lo más operado: se prueba el ISIN de cada clase operada hasta encontrar
    // uno y, si no, el nombre. Lo encontrado y lo no encontrado queda en
    // davinci_lookup_cache.
    for (const f of operados) {
      op.buscados++
      for (const isin of f.claves) {
        try {
          const porNombre = isin.startsWith('NM:')
          let data = await searchFundReturns(page, porNombre ? '' : isin, porNombre ? f.nombre : undefined)
          // Otro fondo (no el buscado) no se guarda como si fuera este
          if (data && data.nombreDavinci && !mismoFondo(f.nombre, data.nombreDavinci)) {
            console.warn(`[fund-monitor] Davinci devolvió otro fondo para ${isin}: "${data.nombreDavinci}" (se buscaba "${f.nombre}")`)
            data = null
          }
          await setLookupCache(isin, data)
          if (data) { op.encontrados++; break }
        } catch (e: any) {
          console.error(`[fund-monitor] Error (operado): ${isin} · ${f.nombre}:`, e.message)
          break
        }
      }
    }
  } catch (e: any) {
    // Un login fallido NO se reintenta en el día: el scheduler chequea cada 15
    // minutos y reintentar el login con la misma cuenta desde dev y prod hizo
    // que Davinci bloqueara el usuario. Se vuelve a probar mañana (o forzando).
    throw new Error(`No se pudo iniciar sesión en Davinci (no se reintenta hasta mañana): ${e.message}`)
  } finally {
    await context.close()
  }

  await markSyncAttempt(SYNC_KEY, true)
  return resultado()
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

// Fondos operados alguna vez (hasta 60 comprados y 60 vendidos) sin
// rendimientos o con una búsqueda vencida. Los del Monitor (o unidos a uno) ya
// traen sus datos y quedan afuera.
async function operadosABuscar(hoy: string) {
  const ranking = await getRankingMasOperado('2000-01-01', hoy, 60)
  const porClave = new Map<string, { nombre: string; claves: string[] }>()
  for (const f of [...ranking.fondos.compras, ...ranking.fondos.ventas]) {
    if (porClave.has(f.key) || (f.rendimientos && !f.rendimientos.vencido)) continue
    const isins = Array.from(new Set([f.isin, ...(f.variantes ?? []).map((v) => v.isin)].map((i) => i.toUpperCase()).filter((i) => ISIN_RE.test(i))))
    // Por ISIN y, si no aparece o no tiene, por nombre
    porClave.set(f.key, { nombre: f.nombre, claves: [...isins, claveNombreDavinci(f.nombre)] })
  }
  // Uno que ya se buscó y no se encontró hace menos de 15 días no se vuelve a buscar
  const cache = await getLookupCaches(Array.from(porClave.values()).flatMap((f) => f.claves))
  return Array.from(porClave.values()).filter((f) => !f.claves.every((i) => {
    const c = cache.get(i)
    return c && !c.data && vigente(c.fetched_at, hoy)
  }))
}

export type SingleFundSyncStatus = 'ok' | 'no_source' | 'error' | 'unavailable'

// Busca en Davinci un único fondo recién cargado o editado, en el momento, para
// que aparezca con datos sin esperar al próximo sync. Nunca lanza: el alta del
// fondo ya se hizo y una falla de Davinci no debe deshacerla — el estado queda
// registrado en fund_monitor_returns y el próximo sync lo reintenta.
export async function syncSingleFund(fund: { id: string; isin: string; nombre: string }): Promise<SingleFundSyncStatus> {
  // Si ese ISIN ya se buscó hace menos de 15 días (Propuestas o el reporte), se usa eso
  try {
    const c = (await getLookupCaches([fund.isin])).get(fund.isin.toUpperCase())
    if (c?.data && vigente(c.fetched_at)) {
      await upsertFundReturns(fund.id, aReturns(c.data), c.fetched_at)
      return 'ok'
    }
  } catch (e: any) {
    console.error('[fund-monitor] No se pudo leer la búsqueda guardada:', fund.isin, e.message)
  }

  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) return 'unavailable'

  try {
    const browser = await getBrowser()
    if (!browser) return 'unavailable'

    const { context, page } = await openDavinciPage(browser)
    try {
      await loginDavinci(page, email, password)
      const data = await searchFundReturns(page, fund.isin, fund.nombre)
      if (!data) {
        await markFundSyncIssue(fund.id, 'no_source', 'Fondo no encontrado en Davinci (ni por ISIN ni por nombre)')
        return 'no_source'
      }
      await upsertFundReturns(fund.id, aReturns(data))
      return 'ok'
    } finally {
      await context.close()
    }
  } catch (e: any) {
    console.error('[fund-monitor] Error buscando el fondo en Davinci:', fund.isin, e.message)
    try { await markFundSyncIssue(fund.id, 'error', e.message ?? 'Error desconocido') } catch {}
    return 'error'
  }
}
