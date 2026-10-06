import { listFundsWithReturns } from '@/lib/db/fundMonitor'
import { getRankingMasOperado, type InstrumentoOperado, type Rendimientos } from '@/lib/db/masOperado'
import { lookupDavinciLive } from '@/lib/fundMonitor/liveLookup'
import { labelRango, mesParaInforme } from '@/lib/masOperado/periodos'
import {
  datosVacios, type FilaBonoOperado, type FilaComparativo, type FilaFondoOperado, type TipoPlantilla,
} from './tipos'

// Datos que las plantillas toman solas de la plataforma: el ranking de las
// órdenes (más operados) y los rendimientos del Monitor de fondos (comparativo).

const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Solo las compras; fondos por nombre (las clases ya vienen unidas) con todos sus rendimientos.
// Rendimientos: los del Monitor y las búsquedas guardadas. A Davinci se va solo
// con `davinci` (el armado automático del último día del mes), y solo por los
// fondos sin datos o con una búsqueda de hace 15 días o más.
export async function filasMasOperado(
  tipo: 'mas_operado_fondos' | 'mas_operado_bonos', desde: string, hasta: string, cantidad: number, opts: { davinci?: boolean } = {},
) {
  const ranking = await getRankingMasOperado(desde, hasta, Math.max(1, Math.min(cantidad, 15)))
  if (tipo === 'mas_operado_fondos') {
    const compras = ranking.fondos.compras
    // Si Davinci no responde queda lo que había
    if (opts.davinci) {
      for (const i of compras) {
        if (!i.rendimientos || i.rendimientos.vencido) i.rendimientos = (await buscarEnDavinci(i)) ?? i.rendimientos
      }
    }
    const fila = (i: InstrumentoOperado): FilaFondoOperado => {
      const r = i.rendimientos
      return {
        nombre: i.nombre,
        r_1y: r?.r_1y ?? null, r_3y: r?.r_3y ?? null, r_5y: r?.r_5y ?? null, r_ytd: r?.r_ytd ?? null,
        y_2025: r?.y_2025 ?? null, y_2024: r?.y_2024 ?? null, y_2023: r?.y_2023 ?? null,
        y_2022: r?.y_2022 ?? null, y_2021: r?.y_2021 ?? null,
      }
    }
    return { compras: compras.map(fila) }
  }
  const fila = (i: InstrumentoOperado): FilaBonoOperado => ({ nombre: i.nombre, cupon: i.cupon, vencimiento: i.vencimiento, moneda: i.moneda })
  return { compras: ranking.bonos.compras.map(fila) }
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

// Fondo que no está en el Monitor ni tiene una búsqueda guardada de menos de 15
// días: se busca en Davinci por el ISIN de cada clase operada hasta encontrar
// uno. Usa la misma búsqueda que las propuestas (una sola sesión, en cola, que
// devuelve lo guardado si tiene menos de 15 días, con pausa si el login falla),
// así que no multiplica logins.
async function buscarEnDavinci(i: InstrumentoOperado): Promise<Rendimientos | null> {
  const isins = Array.from(new Set([i.isin, ...(i.variantes ?? []).map((v) => v.isin)].filter((x) => ISIN_RE.test(x))))
  for (const isin of isins) {
    try {
      const r = await lookupDavinciLive(isin, i.nombre)
      if (r.status === 'unavailable') return null      // sin credenciales o Davinci en pausa: no seguir probando
      if (r.status !== 'ok') continue
      const d = r.data
      return {
        fuente: `${d.nombreDavinci || i.nombre} (Davinci)`,
        fecha: d.asOfDate ? d.asOfDate.split('-').reverse().join('/') : null,
        r_1y: d.r1a, r_3y: d.r3a, r_5y: d.r5a, r_ytd: d.ytd,
        y_2025: d.y2025, y_2024: d.y2024, y_2023: d.y2023, y_2022: d.y2022, y_2021: d.y2021,
      }
    } catch (e: any) {
      console.error('[plantillas] davinci', isin, e.message)
      return null
    }
  }
  return null
}

// pg devuelve las columnas date como Date a medianoche local
function fechaIso(v: unknown) {
  if (!v) return ''
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return String(v).slice(0, 10)
}

export interface CategoriaMonitor { categoria: string; fecha_datos: string; fondos: FilaComparativo[] }

// Fondos activos del Monitor agrupados por categoría (asset class), en el orden del Monitor.
export async function categoriasMonitor(): Promise<CategoriaMonitor[]> {
  const fondos = await listFundsWithReturns()
  const cats: CategoriaMonitor[] = []
  const fechas = new Map<string, string>()
  for (const f of fondos) {
    const categoria = f.categoria || 'Sin categoría'
    let c = cats.find((x) => x.categoria === categoria)
    if (!c) { c = { categoria, fecha_datos: '', fondos: [] }; cats.push(c) }
    c.fondos.push({
      isin: f.isin ?? '', nombre: f.nombre ?? '', gestora: f.gestora ?? '', moneda: f.moneda ?? '', subcategoria: f.subcategoria ?? '',
      r_ytd: num(f.r_ytd), r_1y: num(f.r_1y), r_3y: num(f.r_3y), r_5y: num(f.r_5y),
      y_2025: num(f.y_2025), y_2024: num(f.y_2024), y_2023: num(f.y_2023),
    })
    const fecha = fechaIso(f.as_of_date)
    if (fecha && fecha > (fechas.get(categoria) ?? '')) fechas.set(categoria, fecha)
  }
  for (const c of cats) {
    const f = fechas.get(c.categoria)
    c.fecha_datos = f ? f.split('-').reverse().join('/') : ''
  }
  return cats
}

/** Datos con los que arranca un documento nuevo; los automáticos se completan solos. */
export async function datosIniciales(tipo: TipoPlantilla, opts: { desde?: string; hasta?: string; asset_class?: string; davinci?: boolean }) {
  const datos = datosVacios(tipo)
  if (tipo === 'mas_operado_fondos' || tipo === 'mas_operado_bonos') {
    const p = opts.desde && opts.hasta ? { desde: opts.desde, hasta: opts.hasta, label: labelRango(opts.desde, opts.hasta) } : mesParaInforme()
    datos.desde = p.desde
    datos.hasta = p.hasta
    datos.periodo = p.label
    try {
      Object.assign(datos, await filasMasOperado(tipo, p.desde, p.hasta, datos.cantidad, { davinci: opts.davinci }))
    } catch (e: any) {
      console.error('[plantillas] más operado', e.message)
    }
  }
  if (tipo === 'comparativo_fondos' && opts.asset_class) {
    try {
      const c = (await categoriasMonitor()).find((x) => x.categoria === opts.asset_class)
      if (c) Object.assign(datos, { asset_class: c.categoria, titulo: c.categoria, filas: c.fondos, fecha_datos: c.fecha_datos || datos.fecha_datos })
    } catch (e: any) {
      console.error('[plantillas] monitor', e.message)
    }
  }
  return datos
}
