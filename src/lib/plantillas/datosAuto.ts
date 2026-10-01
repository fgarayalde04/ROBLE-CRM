import { listFundsWithReturns } from '@/lib/db/fundMonitor'
import { getRankingMasOperado, type InstrumentoOperado } from '@/lib/db/masOperado'
import { labelRango, mesParaInforme } from '@/lib/masOperado/periodos'
import {
  datosVacios, type FilaBonoOperado, type FilaComparativo, type FilaFondoOperado, type TipoPlantilla,
} from './tipos'

// Datos que las plantillas toman solas de la plataforma: el ranking de las
// órdenes (más operados) y los rendimientos del Monitor de fondos (comparativo).

const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export async function filasMasOperado(tipo: 'mas_operado_fondos' | 'mas_operado_bonos', desde: string, hasta: string, cantidad: number) {
  const ranking = await getRankingMasOperado(desde, hasta, Math.max(1, Math.min(cantidad, 15)))
  if (tipo === 'mas_operado_fondos') {
    // Si se unieron varias clases, la fila muestra la más operada (ISIN y rendimiento de esa)
    const fila = (i: InstrumentoOperado): FilaFondoOperado => ({
      nombre: i.nombre, isin: i.isin, moneda: i.moneda, r_ytd: i.r_ytd,
      clase: i.variantes && new Set(i.variantes.map((v) => v.clase)).size > 1 ? 'Varias' : i.clase,
    })
    return { compras: ranking.fondos.compras.map(fila), ventas: ranking.fondos.ventas.map(fila) }
  }
  const fila = (i: InstrumentoOperado): FilaBonoOperado => ({ nombre: i.nombre, isin: i.isin, cupon: i.cupon, vencimiento: i.vencimiento, moneda: i.moneda })
  return { compras: ranking.bonos.compras.map(fila), ventas: ranking.bonos.ventas.map(fila) }
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
export async function datosIniciales(tipo: TipoPlantilla, opts: { desde?: string; hasta?: string; asset_class?: string }) {
  const datos = datosVacios(tipo)
  if (tipo === 'mas_operado_fondos' || tipo === 'mas_operado_bonos') {
    const p = opts.desde && opts.hasta ? { desde: opts.desde, hasta: opts.hasta, label: labelRango(opts.desde, opts.hasta) } : mesParaInforme()
    datos.desde = p.desde
    datos.hasta = p.hasta
    datos.periodo = p.label
    try {
      Object.assign(datos, await filasMasOperado(tipo, p.desde, p.hasta, datos.cantidad))
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
