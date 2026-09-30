import { pool } from '@/lib/db/pool'
import { reclassifyInstruments } from '@/lib/db/instruments'
import { getBrowser, closeBrowser } from '@/lib/fondos/browser'
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
  errores: number
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}

const state: DavinciJobState = {
  running: false, total: 0, procesados: 0, encontrados: 0, clasificados: 0, errores: 0,
  error: null, startedAt: null, finishedAt: null,
}

export function getDavinciJobState(): DavinciJobState {
  return { ...state }
}

export function startDavinciCategorias(opts: { reintentar?: boolean } = {}): DavinciJobState {
  if (state.running) return getDavinciJobState()
  Object.assign(state, {
    running: true, total: 0, procesados: 0, encontrados: 0, clasificados: 0, errores: 0,
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

  // Un solo login por corrida y sin reintentos: varios logins seguidos con la
  // misma cuenta hicieron que Davinci bloqueara el usuario. Si el login falla
  // o el browser se cae, la corrida se corta y los fondos que faltan quedan
  // para la próxima (no se marcan como buscados).
  const browser = await getBrowser()
  if (!browser) throw new Error('No se pudo abrir el navegador para Davinci')
  const session = await openDavinciPage(browser)
  try {
    await loginDavinci(session.page, email, password)
  } catch (e) {
    await session.context.close().catch(() => {})
    await closeBrowser()
    throw e
  }
  const buscar = (isin: string, nombre: string) => searchFundReturns(session.page, isin, nombre)

  try {
    for (const r of rows) {
      try {
        const data = await buscar(r.isin, r.nombre)
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
        // Se deja este fondo sin marcar como buscado (la próxima corrida lo
        // reintenta) y se sigue.
        state.errores++
        console.error('[riesgo-davinci]', r.isin, e?.message ?? e)
        if (/closed|crash|disconnected/i.test(e?.message ?? '')) {
          await closeBrowser()
          throw new Error('Se cortó la conexión con Davinci; los fondos que faltan quedan para la próxima corrida')
        }
      }
      state.procesados++
    }
  } finally {
    await session.context.close().catch(() => {})
  }
}
