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
import { loginDavinci, searchFundReturns, openDavinciPage } from '@/lib/fundMonitor/davinciScraper'
import { listActiveFunds, upsertFundReturns, markFundSyncIssue, getSyncState, markSyncAttempt } from '@/lib/db/fundMonitor'

export interface FundSyncRowResult { isin: string; nombre: string; status: 'ok' | 'no_source' | 'error'; error?: string }
export interface FundSyncResult { total: number; ok: number; no_source: number; error: number; results: FundSyncRowResult[] }
export interface FundSyncSkipped { skipped: true; reason: string }

// Davinci reportó ~50 mil descargas por día desde nuestro usuario: el Monitor
// ya no se actualiza a diario sino cada FUND_MONITOR_SYNC_DAYS días (15 por
// defecto). Los fondos nuevos o editados se buscan en el momento
// (syncSingleFund) y los que no están en el Monitor, desde Propuestas
// (liveLookup), así que no hace falta refrescar todo seguido.
//
// Las fechas se guardan en la base (davinci_sync_state): antes vivían en
// memoria y cada deploy volvía a disparar la corrida completa. Un intento
// fallido (ej. login rechazado) no se reintenta hasta el día siguiente —
// Davinci bloquea la cuenta ante logins repetidos. ?force=1 saltea todo.
const SYNC_KEY = 'fund_monitor'
const SYNC_EVERY_DAYS = Number(process.env.FUND_MONITOR_SYNC_DAYS) || 15
const DAY_MS = 24 * 60 * 60 * 1000

export async function syncFundMonitor(opts?: { force?: boolean }): Promise<FundSyncResult | FundSyncSkipped> {
  const force = opts?.force ?? false
  if (!force) {
    const state = await getSyncState(SYNC_KEY)
    const now = Date.now()
    if (state.last_success_at && now - state.last_success_at.getTime() < SYNC_EVERY_DAYS * DAY_MS) {
      return { skipped: true, reason: `last sync ${state.last_success_at.toISOString()} (every ${SYNC_EVERY_DAYS} days)` }
    }
    if (state.last_attempt_at && now - state.last_attempt_at.getTime() < DAY_MS) {
      return { skipped: true, reason: `last attempt failed ${state.last_attempt_at.toISOString()}, retry tomorrow` }
    }
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

  const funds = await listActiveFunds()
  const results: FundSyncRowResult[] = []

  // Se registra el intento antes de loguear: si el login falla o el proceso
  // se corta a mitad (ej. un deploy), no se vuelve a correr hasta mañana.
  await markSyncAttempt(SYNC_KEY, false)

  const { context, page } = await openDavinciPage(browser)
  try {
    await loginDavinci(page, email, password)

    for (const fund of funds) {
      try {
        const data = await searchFundReturns(page, fund.isin, fund.nombre)
        if (!data) {
          console.warn(`[fund-monitor] Sin fuente: ${fund.isin} · ${fund.nombre}`)
          await markFundSyncIssue(fund.id, 'no_source', 'Fondo no encontrado en Davinci (ni por ISIN ni por nombre)')
          results.push({ isin: fund.isin, nombre: fund.nombre, status: 'no_source' })
          continue
        }
        await upsertFundReturns(fund.id, {
          as_of_date: data.asOfDate,
          r_ytd: data.ytd,
          r_1y: data.r1a,
          r_3y: data.r3a,
          r_5y: data.r5a,
          y_2025: data.y2025,
          y_2024: data.y2024,
          y_2023: data.y2023,
          y_2022: data.y2022,
          y_2021: data.y2021,
        })
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'ok' })
      } catch (e: any) {
        // Un fondo que falla no corta el resto de la corrida — se registra
        // el error y se sigue con el próximo (Fase 6: "probar el
        // siguiente... seguir funcionando el resto de la aplicación").
        console.error(`[fund-monitor] Error: ${fund.isin} · ${fund.nombre}:`, e.message)
        await markFundSyncIssue(fund.id, 'error', e.message ?? 'Error desconocido')
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'error', error: e.message })
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
  return {
    total: funds.length,
    ok: results.filter(r => r.status === 'ok').length,
    no_source: results.filter(r => r.status === 'no_source').length,
    error: results.filter(r => r.status === 'error').length,
    results,
  }
}

export type SingleFundSyncStatus = 'ok' | 'no_source' | 'error' | 'unavailable'

// Busca en Davinci un único fondo recién cargado o editado, en el momento, para
// que aparezca con datos sin esperar al próximo sync. Nunca lanza: el alta del
// fondo ya se hizo y una falla de Davinci no debe deshacerla — el estado queda
// registrado en fund_monitor_returns y el próximo sync lo reintenta.
export async function syncSingleFund(fund: { id: string; isin: string; nombre: string }): Promise<SingleFundSyncStatus> {
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
      await upsertFundReturns(fund.id, {
        as_of_date: data.asOfDate,
        r_ytd: data.ytd,
        r_1y: data.r1a,
        r_3y: data.r3a,
        r_5y: data.r5a,
        y_2025: data.y2025,
        y_2024: data.y2024,
        y_2023: data.y2023,
        y_2022: data.y2022,
        y_2021: data.y2021,
      })
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
