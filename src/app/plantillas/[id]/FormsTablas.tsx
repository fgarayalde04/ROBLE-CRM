'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  filaBonoVacia, filaFondoVacia,
  type ComparativoFondosDatos, type FilaComparativo, type MasOperadoDatos,
} from '@/lib/plantillas/tipos'
import { INICIO_HISTORICO, hoyMontevideo, labelRango, moverPeriodo, periodoMes } from '@/lib/masOperado/periodos'
import type { CategoriaMonitor } from '@/lib/plantillas/datosAuto'

// Formularios del editor para las plantillas de tabla: comparativo de fondos
// (datos del Monitor) y fondos / bonos más operados (datos de las órdenes).

const input = 'w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 bg-white'
const celda = 'w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 bg-white'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'
const tituloCls = 'text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2'

type SetDatos = (p: Record<string, unknown>) => void

function Campo({ label, value, placeholder, onChange, medio = false }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void; medio?: boolean
}) {
  return (
    <div className={medio ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
      <label className={labelCls}>{label}</label>
      <input className={input} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Encabezado({ datos, set, phTitulo }: { datos: any; set: SetDatos; phTitulo: string }) {
  return (
    <div>
      <p className={tituloCls}>Encabezado</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo medio label="Categoría (arriba a la derecha)" value={datos.categoria} placeholder="Fondos de inversión" onChange={(v) => set({ categoria: v })} />
        <Campo medio label="Mes" value={datos.periodo} placeholder="Septiembre 2026" onChange={(v) => set({ periodo: v })} />
        <Campo label="Título" value={datos.titulo} placeholder={phTitulo} onChange={(v) => set({ titulo: v })} />
        <Campo label="Subtítulo (opcional)" value={datos.subtitulo} onChange={(v) => set({ subtitulo: v })} />
        <div className="col-span-2">
          <label className={labelCls}>Comentario (opcional) <span className="text-gray-400 font-normal">— dejá una línea en blanco entre párrafos</span></label>
          <textarea rows={3} className={`${input} resize-y`} value={datos.comentario ?? ''} onChange={(e) => set({ comentario: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)

// ── Comparativo de fondos ────────────────────────────────────────────────────

export function FormComparativo({ datos, set }: { datos: ComparativoFondosDatos; set: SetDatos }) {
  const [categorias, setCategorias] = useState<CategoriaMonitor[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState(false)

  async function traer() {
    const res = await fetch('/api/plantillas/fuentes?fuente=monitor')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'No se pudo leer el Monitor')
    setCategorias(data.categorias)
    return data.categorias as CategoriaMonitor[]
  }

  useEffect(() => { traer().catch((e) => setError(e.message)) }, [])

  const filas = datos.filas ?? []
  const cat = categorias?.find((c) => c.categoria === datos.asset_class)
  const elegidos = new Set(filas.map((f) => f.isin))

  function elegirCategoria(nombre: string) {
    const c = categorias?.find((x) => x.categoria === nombre)
    if (!c) return
    if (filas.length && !confirm('Se reemplazan los fondos de la tabla por los de la nueva categoría. ¿Seguir?')) return
    // El título sigue a la categoría mientras no se lo haya cambiado a mano
    const titulo = !datos.titulo?.trim() || datos.titulo === datos.asset_class ? c.categoria : datos.titulo
    set({ asset_class: c.categoria, titulo, filas: c.fondos, fecha_datos: c.fecha_datos || datos.fecha_datos })
  }

  function alternar(f: FilaComparativo) {
    if (!cat) return
    const nuevos = elegidos.has(f.isin) ? filas.filter((x) => x.isin !== f.isin) : cat.fondos.filter((x) => elegidos.has(x.isin) || x.isin === f.isin)
    set({ filas: nuevos })
  }

  async function actualizar() {
    setActualizando(true); setError(null)
    try {
      const cats = await traer()
      const c = cats.find((x) => x.categoria === datos.asset_class)
      const porIsin = new Map(cats.flatMap((x) => x.fondos).map((f) => [f.isin, f]))
      set({ filas: filas.map((f) => porIsin.get(f.isin) ?? f), ...(c?.fecha_datos ? { fecha_datos: c.fecha_datos } : {}) })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActualizando(false)
    }
  }

  return (
    <>
      <Encabezado datos={datos} set={set} phTitulo="Renta fija global" />

      <div>
        <p className={tituloCls}>Fondos <span className="normal-case tracking-normal font-normal">— del <Link href="/fondos-monitor" className="text-blue-600 hover:underline">Monitor de fondos</Link></span></p>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Categoría / asset class</label>
            <select className={input} value={datos.asset_class ?? ''} onChange={(e) => elegirCategoria(e.target.value)} disabled={!categorias}>
              <option value="">{categorias ? 'Elegí una categoría…' : 'Cargando…'}</option>
              {categorias?.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.fondos.length})</option>)}
            </select>
          </div>
          <Campo medio label="Datos al" value={datos.fecha_datos} placeholder="30/09/2026" onChange={(v) => set({ fecha_datos: v })} />
        </div>

        {cat && (
          <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {cat.fondos.map((f) => (
              <label key={f.isin} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={elegidos.has(f.isin)} onChange={() => alternar(f)} />
                <span className="flex-1 min-w-0">
                  <span className="text-gray-800">{f.nombre}</span>
                  {f.subcategoria && <span className="text-gray-400"> · {f.subcategoria}</span>}
                </span>
                <span className="text-gray-500 tabular-nums">YTD {pct(f.r_ytd)}</span>
              </label>
            ))}
          </div>
        )}
        {datos.asset_class && categorias && !cat && (
          <p className="mt-2 text-xs text-amber-700">La categoría “{datos.asset_class}” ya no está en el Monitor; la tabla queda con los datos guardados.</p>
        )}
        {filas.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span>{filas.length} {filas.length === 1 ? 'fondo' : 'fondos'} en la tabla</span>
            <button type="button" onClick={actualizar} disabled={actualizando} className="text-blue-600 hover:underline disabled:opacity-50">
              {actualizando ? 'Actualizando…' : 'Actualizar rendimientos'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Más operados (fondos / bonos) ────────────────────────────────────────────

type ColEdit = { key: string; label: string; ancho: string }

const COLS_EDIT: Record<'mas_operado_fondos' | 'mas_operado_bonos', ColEdit[]> = {
  mas_operado_fondos: [
    { key: 'nombre', label: 'Fondo', ancho: 'min-w-[160px]' },
    { key: 'isin', label: 'ISIN', ancho: 'w-28' },
    { key: 'moneda', label: 'Moneda', ancho: 'w-16' },
  ],
  mas_operado_bonos: [
    { key: 'nombre', label: 'Bono', ancho: 'min-w-[160px]' },
    { key: 'isin', label: 'ISIN', ancho: 'w-28' },
    { key: 'cupon', label: 'Cupón', ancho: 'w-20' },
    { key: 'vencimiento', label: 'Vencimiento', ancho: 'w-24' },
    { key: 'moneda', label: 'Moneda', ancho: 'w-16' },
  ],
}

export function FormMasOperado({ tipo, datos, set }: {
  tipo: 'mas_operado_fondos' | 'mas_operado_bonos'; datos: MasOperadoDatos<any>; set: SetDatos
}) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fondos = tipo === 'mas_operado_fondos'
  const mes = datos.desde && datos.desde !== INICIO_HISTORICO ? datos.desde.slice(0, 7) : ''

  async function cargar(desde: string, hasta: string, cantidad = datos.cantidad || 5) {
    const hayFilas = (datos.compras?.length ?? 0) + (datos.ventas?.length ?? 0) > 0
    if (hayFilas && !confirm('Se reemplazan las tablas por lo que dicen las órdenes (se pierden los cambios hechos a mano). ¿Seguir?')) return
    setCargando(true); setError(null)
    try {
      const res = await fetch(`/api/plantillas/fuentes?fuente=ordenes&tipo=${tipo}&desde=${desde}&hasta=${hasta}&cantidad=${cantidad}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron leer las órdenes')
      const periodo = datos.desde === desde && datos.hasta === hasta ? datos.periodo : labelRango(desde, hasta)
      set({ desde, hasta, cantidad, periodo, compras: data.compras, ventas: data.ventas })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const elegirMes = (valor: string) => {
    if (!valor) return
    const p = periodoMes(`${valor}-01`)
    cargar(p.desde, p.hasta)
  }
  const mesAnterior = moverPeriodo(periodoMes(hoyMontevideo()), -1)

  return (
    <>
      <Encabezado datos={datos} set={set} phTitulo={fondos ? 'Los fondos más operados' : 'Los bonos más operados'} />

      <div>
        <p className={tituloCls}>Órdenes del período <span className="normal-case tracking-normal font-normal">— el ranking sale solo de las órdenes enviadas (<Link href="/mas-operado" className="text-blue-600 hover:underline">ver detalle</Link>)</span></p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Mes</label>
            <input type="month" className={input} value={mes} max={hoyMontevideo().slice(0, 7)} onChange={(e) => elegirMes(e.target.value)} disabled={cargando} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Instrumentos por tabla</label>
            <select className={input} value={datos.cantidad || 5} disabled={cargando || !datos.desde}
              onChange={(e) => cargar(datos.desde, datos.hasta, Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
          {datos.desde && <span className="text-gray-500">{labelRango(datos.desde, datos.hasta)}</span>}
          <button type="button" onClick={() => cargar(mesAnterior.desde, mesAnterior.hasta)} disabled={cargando} className="text-blue-600 hover:underline disabled:opacity-50">
            Mes anterior
          </button>
          <button type="button" onClick={() => cargar(INICIO_HISTORICO, hoyMontevideo())} disabled={cargando} className="text-blue-600 hover:underline disabled:opacity-50">
            Todo hasta hoy
          </button>
          {datos.desde && (
            <button type="button" onClick={() => cargar(datos.desde, datos.hasta)} disabled={cargando} className="text-blue-600 hover:underline disabled:opacity-50">
              {cargando ? 'Cargando…' : 'Volver a cargar'}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <TablaEditable titulo="Más comprados" tipo={tipo} filas={datos.compras ?? []} onChange={(f) => set({ compras: f })} />
      <TablaEditable titulo="Más vendidos" tipo={tipo} filas={datos.ventas ?? []} onChange={(f) => set({ ventas: f })} />
      {fondos && <p className="text-[11px] text-gray-400">El YTD sale del Monitor de fondos (por ISIN); si el fondo no está en el Monitor queda “—”.</p>}
    </>
  )
}

function TablaEditable({ titulo, tipo, filas, onChange }: {
  titulo: string; tipo: 'mas_operado_fondos' | 'mas_operado_bonos'; filas: any[]; onChange: (f: any[]) => void
}) {
  const cols = COLS_EDIT[tipo]
  const upd = (i: number, k: string, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= filas.length) return
    const c = [...filas]
    ;[c[i], c[j]] = [c[j], c[i]]
    onChange(c)
  }
  return (
    <div>
      <p className={tituloCls}>{titulo}</p>
      <div className="mobile-scroll-x">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="w-5" />
              {cols.map((c) => <th key={c.key} className={`text-left font-medium pb-1 px-0.5 ${c.ancho}`}>{c.label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td className="text-gray-400 pr-1">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-0.5 py-0.5">
                    <input className={`${celda} ${c.key === 'nombre' && !String(f.nombre ?? '').trim() ? 'border-amber-300' : ''}`} value={f[c.key] ?? ''} onChange={(e) => upd(i, c.key, e.target.value)} />
                  </td>
                ))}
                <td className="whitespace-nowrap pl-1">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="px-1 text-gray-500 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === filas.length - 1} className="px-1 text-gray-500 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => onChange(filas.filter((_, j) => j !== i))} className="px-1 text-red-500" aria-label="Quitar">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && <p className="text-xs text-gray-400">Sin instrumentos.</p>}
      <button
        type="button"
        onClick={() => onChange([...filas, tipo === 'mas_operado_fondos' ? filaFondoVacia() : filaBonoVacia()])}
        className="mt-1.5 text-xs text-blue-600 hover:underline"
      >
        + Agregar a mano
      </button>
    </div>
  )
}
