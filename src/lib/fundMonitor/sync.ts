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
import { listActiveFunds, upsertFundReturns, markFundSyncIssue } from '@/lib/db/fundMonitor'

export interface FundSyncRowResult { isin: string; nombre: string; status: 'ok' | 'no_source' | 'error'; error?: string }
export interface FundSyncResult { total: number; ok: number; no_source: number; error: number; results: FundSyncRowResult[] }
export interface FundSyncSkipped { skipped: true; reason: string }

// Sincroniza como mucho una vez por día: si ya se corrió hoy, no vuelve a
// pegarle a Davinci (ver Fase 6 — "actualizar como máximo una vez por
// día"). Solo se marca al terminar la corrida completa (login + loop de
// fondos) sin excepción — un login fallido no la marca, así que tanto un
// reintento manual como el scheduler de instrumentation.ts la vuelven a
// intentar más tarde el mismo día.
let lastSyncDay = ''

export async function syncFundMonitor(opts?: { force?: boolean }): Promise<FundSyncResult | FundSyncSkipped> {
  const force = opts?.force ?? false
  const today = new Date().toISOString().slice(0, 10)
  if (!force && lastSyncDay === today) {
    return { skipped: true, reason: 'already synced today' }
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

  const { context, page } = await openDavinciPage(browser)
  try {
    await loginDavinci(page, email, password)

    for (const fund of funds) {
      try {
        const data = await searchFundReturns(page, fund.isin)
        if (!data) {
          await markFundSyncIssue(fund.id, 'no_source', 'ISIN no encontrado en Davinci')
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
        await markFundSyncIssue(fund.id, 'error', e.message ?? 'Error desconocido')
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'error', error: e.message })
      }
    }
  } catch (e: any) {
    throw new Error(`No se pudo iniciar sesión en Davinci: ${e.message}`)
  } finally {
    await context.close()
  }

  lastSyncDay = today
  return {
    total: funds.length,
    ok: results.filter(r => r.status === 'ok').length,
    no_source: results.filter(r => r.status === 'no_source').length,
    error: results.filter(r => r.status === 'error').length,
    results,
  }
}
