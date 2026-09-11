import { NextRequest, NextResponse } from 'next/server'
import { getBrowser } from '@/lib/fondos/browser'
import { loginDavinci, searchFundReturns, openDavinciPage } from '@/lib/fundMonitor/davinciScraper'
import { listActiveFunds, upsertFundReturns, markFundSyncIssue } from '@/lib/db/fundMonitor'

export const maxDuration = 300 // 5 minutos — Railway/Vercel matan la función después de esto

// Sincroniza como mucho una vez por día: si ya se corrió hoy, no vuelve a
// pegarle a Davinci (ver Fase 6 — "actualizar como máximo una vez por día").
let lastSyncDay = ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
  const today = new Date().toISOString().slice(0, 10)
  if (!force && lastSyncDay === today) {
    return NextResponse.json({ skipped: true, reason: 'already synced today' })
  }

  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) {
    return NextResponse.json({ error: 'Faltan DAVINCI_EMAIL / DAVINCI_PASSWORD en el entorno' }, { status: 500 })
  }

  const browser = await getBrowser()
  if (!browser) {
    return NextResponse.json({ error: 'No se pudo iniciar el browser headless' }, { status: 500 })
  }

  const funds = await listActiveFunds()
  const results: { isin: string; nombre: string; status: string; error?: string }[] = []

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
        // Un fondo que falla no corta el resto de la corrida — se registra el
        // error y se sigue con el próximo (Fase 6: "probar el siguiente...
        // seguir funcionando el resto de la aplicación").
        await markFundSyncIssue(fund.id, 'error', e.message ?? 'Error desconocido')
        results.push({ isin: fund.isin, nombre: fund.nombre, status: 'error', error: e.message })
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo iniciar sesión en Davinci: ${e.message}` }, { status: 500 })
  } finally {
    await context.close()
  }

  lastSyncDay = today
  const ok = results.filter(r => r.status === 'ok').length
  const noSource = results.filter(r => r.status === 'no_source').length
  const errors = results.filter(r => r.status === 'error').length
  return NextResponse.json({ total: funds.length, ok, no_source: noSource, error: errors, results })
}
