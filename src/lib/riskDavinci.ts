import { pool } from '@/lib/db/pool'
import { reclassifyInstruments } from '@/lib/db/instruments'
import { getBrowser } from '@/lib/fondos/browser'
import { loginDavinci, openDavinciPage, searchFundReturns } from '@/lib/fundMonitor/davinciScraper'

// Busca en Davinci la categoría Morningstar de los fondos que quedaron sin
// clasificar o clasificados solo por el nombre, la guarda en instrument_master.
// categoria (si estaba vacía) y recalcula el riesgo. Lo encontrado queda
// guardado: la próxima vez ese fondo ya se clasifica por su categoría.
//
// Corre en segundo plano (un browser, de a un fondo): la pantalla consulta el
// progreso. Un fondo que Davinci no tiene se marca (riesgo_davinci_at) y no se
// vuelve a buscar, salvo que se pida con `reintentar`.

export interface DavinciJobState {
  running: boolean
  total: number
  procesados: number
  encontrados: number
  clasificados: number
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}

const state: DavinciJobState = {
  running: false, total: 0, procesados: 0, encontrados: 0, clasificados: 0,
  error: null, startedAt: null, finishedAt: null,
}

export function getDavinciJobState(): DavinciJobState {
  return { ...state }
}

export function startDavinciCategorias(opts: { reintentar?: boolean } = {}): DavinciJobState {
  if (state.running) return getDavinciJobState()
  Object.assign(state, {
    running: true, total: 0, procesados: 0, encontrados: 0, clasificados: 0,
    error: null, startedAt: new Date().toISOString(), finishedAt: null,
  })
  run(opts.reintentar ?? false)
    .catch((e) => { state.error = e?.message ?? String(e) })
    .finally(() => { state.running = false; state.finishedAt = new Date().toISOString() })
  return getDavinciJobState()
}

async function run(reintentar: boolean) {
  const email = process.env.DAVINCI_EMAIL
  const password = process.env.DAVINCI_PASSWORD
  if (!email || !password) throw new Error('Faltan DAVINCI_EMAIL / DAVINCI_PASSWORD en este ambiente')

  const { rows } = await pool.query(
    `select id, nombre, isin from instrument_master
      where tipo_activo = 'fondo' and activo
        and isin is not null and isin <> ''
        and coalesce(riesgo_fuente, 'sin_clasificar') in ('nombre', 'sin_clasificar')
        and coalesce(categoria, '') = ''
        ${reintentar ? '' : 'and riesgo_davinci_at is null'}
      order by nombre`
  )
  state.total = rows.length
  if (rows.length === 0) return

  const browser = await getBrowser()
  if (!browser) throw new Error('No se pudo abrir el navegador para Davinci')

  let session = await openDavinciPage(browser)
  await loginDavinci(session.page, email, password)
  let erroresSeguidos = 0
  try {
    for (const r of rows) {
      try {
        const data = await searchFundReturns(session.page, r.isin, r.nombre)
        erroresSeguidos = 0
        const categoria = data?.categoriaDavinci?.trim() || null
        await pool.query(
          `update instrument_master
              set riesgo_davinci_at = now(),
                  categoria = coalesce(nullif(categoria, ''), $1)
            where id = $2`,
          [categoria, r.id]
        )
        if (categoria) {
          state.encontrados++
          await reclassifyInstruments([r.id])
          const { rows: after } = await pool.query(
            `select riesgo_fuente from instrument_master where id = $1`, [r.id]
          )
          if (after[0]?.riesgo_fuente === 'categoria') state.clasificados++
        }
      } catch (e: any) {
        console.error('[riesgo-davinci]', r.isin, e?.message ?? e)
        // Tres errores seguidos: la sesión de Davinci probablemente se cayó.
        if (++erroresSeguidos >= 3) {
          await session.context.close().catch(() => {})
          session = await openDavinciPage(browser)
          await loginDavinci(session.page, email, password)
          erroresSeguidos = 0
        }
      }
      state.procesados++
    }
  } finally {
    await session.context.close().catch(() => {})
  }
}
