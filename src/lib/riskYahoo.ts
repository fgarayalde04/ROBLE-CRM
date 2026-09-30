import { pool } from '@/lib/db/pool'
import { reclassifyInstruments } from '@/lib/db/instruments'
import { lookupYahooEquity } from '@/lib/yahooFinance'

// Busca una vez en Yahoo el sector, la industria y el país de las acciones del
// maestro que todavía no los tienen, los guarda y recalcula el riesgo. Lo que
// Yahoo no tiene queda marcado (riesgo_yahoo_at) y no se vuelve a buscar.
// Corre en segundo plano; arranca solo al abrir Instrumentos si hay pendientes.

export interface YahooJobState {
  running: boolean
  total: number
  procesados: number
  encontrados: number
  errores: number
  error: string | null
  finishedAt: string | null
}

const state: YahooJobState = {
  running: false, total: 0, procesados: 0, encontrados: 0, errores: 0, error: null, finishedAt: null,
}

export function getYahooJobState(): YahooJobState {
  return { ...state }
}

const PENDIENTES_SQL = `
  from instrument_master
 where tipo_activo = 'accion' and activo
   and coalesce(riesgo_fuente, '') <> 'manual'
   and coalesce(pais, '') = ''
   and riesgo_yahoo_at is null
   and (coalesce(isin, '') <> '' or coalesce(ticker, '') <> '')`

export async function hayAccionesPendientes(): Promise<boolean> {
  const { rows } = await pool.query(`select 1 ${PENDIENTES_SQL} limit 1`)
  return rows.length > 0
}

export function startYahooSectores(): YahooJobState {
  if (state.running) return getYahooJobState()
  Object.assign(state, { running: true, total: 0, procesados: 0, encontrados: 0, errores: 0, error: null, finishedAt: null })
  run()
    .catch((e) => { state.error = e?.message ?? String(e) })
    .finally(() => { state.running = false; state.finishedAt = new Date().toISOString() })
  return getYahooJobState()
}

async function run() {
  const { rows } = await pool.query(`select id, isin, ticker ${PENDIENTES_SQL} order by nombre`)
  state.total = rows.length
  for (const r of rows) {
    try {
      let info = r.isin ? await lookupYahooEquity(r.isin) : null
      if (!info && r.ticker) info = await lookupYahooEquity(r.ticker)
      await pool.query(
        `update instrument_master
            set riesgo_yahoo_at = now(),
                sector    = coalesce(nullif(sector, ''), $1),
                industria = coalesce(nullif(industria, ''), $2),
                pais      = coalesce(nullif(pais, ''), $3)
          where id = $4`,
        [info?.sector ?? null, info?.industria ?? null, info?.pais ?? null, r.id]
      )
      if (info?.pais) state.encontrados++
      await reclassifyInstruments([r.id])
    } catch (e: any) {
      // No se marca como buscada: se reintenta la próxima vez.
      state.errores++
      console.error('[riesgo-yahoo]', r.isin ?? r.ticker, e?.message ?? e)
    }
    state.procesados++
    await new Promise((res) => setTimeout(res, 300))   // no saturar a Yahoo
  }
}
