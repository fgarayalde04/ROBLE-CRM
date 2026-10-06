'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  COLUMNAS_COMPARATIVO, COLUMNAS_REND_FONDO, filaBonoVacia, filaFondoVacia,
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
  const manuales = filas.filter((f) => f.manual_id)
  const delMonitor = filas.filter((f) => !f.manual_id)
  const cat = categorias?.find((c) => c.categoria === datos.asset_class)
  const sub = datos.subcategoria_filtro ?? ''
  const subcategorias = cat ? Array.from(new Set(cat.fondos.map((f) => f.subcategoria).filter(Boolean))) : []
  const visibles = cat ? cat.fondos.filter((f) => !sub || f.subcategoria === sub) : []
  const elegidos = new Set(delMonitor.map((f) => f.isin))

  // El título sigue a la categoría / subcategoría mientras no se lo haya cambiado a mano
  const tituloAuto = (nuevo: string) =>
    !datos.titulo?.trim() || datos.titulo === datos.asset_class || (!!sub && datos.titulo === sub) ? nuevo : datos.titulo

  function elegirCategoria(nombre: string) {
    const c = categorias?.find((x) => x.categoria === nombre)
    if (!c) return
    if (filas.length && !confirm('Se reemplazan los fondos de la tabla (también los agregados a mano) por los de la nueva categoría. ¿Seguir?')) return
    set({ asset_class: c.categoria, subcategoria_filtro: '', titulo: tituloAuto(c.categoria), filas: c.fondos, fecha_datos: c.fecha_datos || datos.fecha_datos })
  }

  function elegirSubcategoria(s: string) {
    if (!cat) return
    const delSub = cat.fondos.filter((f) => !s || f.subcategoria === s)
    set({ subcategoria_filtro: s, titulo: tituloAuto(s || cat.categoria), filas: [...delSub, ...manuales] })
  }

  function alternar(f: FilaComparativo) {
    if (!cat) return
    const nuevos = elegidos.has(f.isin)
      ? delMonitor.filter((x) => x.isin !== f.isin)
      : cat.fondos.filter((x) => elegidos.has(x.isin) || x.isin === f.isin)
    set({ filas: [...nuevos, ...manuales] })
  }

  async function actualizar() {
    setActualizando(true); setError(null)
    try {
      const cats = await traer()
      const c = cats.find((x) => x.categoria === datos.asset_class)
      const porIsin = new Map(cats.flatMap((x) => x.fondos).map((f) => [f.isin, f]))
      set({ filas: filas.map((f) => (f.manual_id ? f : porIsin.get(f.isin) ?? f)), ...(c?.fecha_datos ? { fecha_datos: c.fecha_datos } : {}) })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActualizando(false)
    }
  }

  const setManual = (id: string, patch: Partial<FilaComparativo>) =>
    set({ filas: filas.map((f) => (f.manual_id === id ? { ...f, ...patch } : f)) })
  const agregarManual = () => set({
    filas: [...filas, {
      manual_id: Math.random().toString(36).slice(2, 10), isin: '', nombre: '', gestora: '', moneda: 'USD', subcategoria: sub,
      r_ytd: null, r_1y: null, r_3y: null, r_5y: null, y_2025: null, y_2024: null, y_2023: null,
    }],
  })

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
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Subcategoría</label>
            <select className={input} value={sub} onChange={(e) => elegirSubcategoria(e.target.value)} disabled={!cat || subcategorias.length === 0}>
              <option value="">Todas</option>
              {subcategorias.map((s) => <option key={s} value={s}>{s} ({cat!.fondos.filter((f) => f.subcategoria === s).length})</option>)}
            </select>
          </div>
          <Campo medio label="Datos al" value={datos.fecha_datos} placeholder="30/09/2026" onChange={(v) => set({ fecha_datos: v })} />
        </div>

        {cat && (
          <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {visibles.map((f) => (
              <label key={f.isin} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={elegidos.has(f.isin)} onChange={() => alternar(f)} />
                <span className="flex-1 min-w-0">
                  <span className="text-gray-800">{f.nombre}</span>
                  {f.subcategoria && !sub && <span className="text-gray-400"> · {f.subcategoria}</span>}
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
            <span>{filas.length} {filas.length === 1 ? 'fondo' : 'fondos'} en la tabla{manuales.length ? ` (${manuales.length} a mano)` : ''}</span>
            <button type="button" onClick={actualizar} disabled={actualizando} className="text-blue-600 hover:underline disabled:opacity-50">
              {actualizando ? 'Actualizando…' : 'Actualizar rendimientos'}
            </button>
          </div>
        )}
      </div>

      <div>
        <p className={tituloCls}>Fondos que no están en el Monitor</p>
        <div className="space-y-3">
          {manuales.map((f) => (
            <FondoManual key={f.manual_id} f={f} subcategorias={subcategorias}
              onChange={(patch) => setManual(f.manual_id!, patch)}
              onQuitar={() => set({ filas: filas.filter((x) => x.manual_id !== f.manual_id) })} />
          ))}
        </div>
        <button
          type="button" onClick={agregarManual}
          className="mt-2 w-full py-2 text-xs font-semibold border border-dashed border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
        >
          + Agregar fondo a mano
        </button>
      </div>
    </>
  )
}

function FondoManual({ f, subcategorias, onChange, onQuitar }: {
  f: FilaComparativo; subcategorias: string[]; onChange: (p: Partial<FilaComparativo>) => void; onQuitar: () => void
}) {
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const listId = `subcats-${f.manual_id}`

  async function buscar() {
    const isin = f.isin.trim().toUpperCase()
    if (!isin) { setAviso('Escribí el ISIN para buscar'); return }
    setBuscando(true); setAviso(null)
    try {
      const res = await fetch(`/api/fund-monitor/lookup?isin=${encodeURIComponent(isin)}&nombre=${encodeURIComponent(f.nombre)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo buscar')
      if (!data.found) { setAviso('No se encontró en el Monitor ni en Davinci: completalo a mano.'); return }
      const r = data.returns
      onChange({
        isin, nombre: f.nombre.trim() || data.nombre || '',
        r_ytd: r.return_ytd, r_1y: r.return_1y, r_3y: r.return_3y, r_5y: r.return_5y,
        y_2025: r.return_2025, y_2024: r.return_2024, y_2023: r.return_2023,
      })
      setAviso(data.source === 'monitor' ? 'Rendimientos del Monitor de fondos.' : 'Rendimientos de Davinci.')
    } catch (e: any) {
      setAviso(e.message)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input className={`${celda} flex-1 ${!f.nombre.trim() ? 'border-amber-300' : ''}`} placeholder="Nombre del fondo" value={f.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
        <button type="button" onClick={onQuitar} className="px-1 text-red-500 text-xs" aria-label="Quitar">✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 4 }}>
        <input className={celda} placeholder="Gestora" value={f.gestora} onChange={(e) => onChange({ gestora: e.target.value })} />
        <input className={celda} placeholder="Moneda" value={f.moneda} onChange={(e) => onChange({ moneda: e.target.value })} />
        <input className={celda} placeholder="Subcategoría" list={listId} value={f.subcategoria} onChange={(e) => onChange({ subcategoria: e.target.value })} />
        <datalist id={listId}>{subcategorias.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <div className="flex items-center gap-2">
        <input className={`${celda} font-mono flex-1`} placeholder="ISIN (opcional, para buscar los rendimientos)" value={f.isin} onChange={(e) => onChange({ isin: e.target.value.toUpperCase() })} />
        <button type="button" onClick={buscar} disabled={buscando} className="text-xs text-blue-600 hover:underline whitespace-nowrap disabled:opacity-50">
          {buscando ? 'Buscando…' : 'Buscar rendimientos'}
        </button>
      </div>
      {aviso && <p className="text-[11px] text-gray-500">{aviso}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
        {COLUMNAS_COMPARATIVO.map((c) => (
          <label key={c.key} className="flex flex-col">
            <span className="text-[9px] text-gray-400 uppercase">{c.label}</span>
            <RendInput valor={(f[c.key] as number | null) ?? null} onChange={(v) => onChange({ [c.key]: v } as Partial<FilaComparativo>)} />
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Más operados (fondos / bonos) ────────────────────────────────────────────

type ColEdit = { key: string; label: string; ancho: string }

const COLS_EDIT: Record<'mas_operado_fondos' | 'mas_operado_bonos', ColEdit[]> = {
  mas_operado_fondos: [
    { key: 'nombre', label: 'Fondo', ancho: 'min-w-[200px]' },
  ],
  mas_operado_bonos: [
    { key: 'nombre', label: 'Bono', ancho: 'min-w-[160px]' },
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
    const hayFilas = (datos.compras?.length ?? 0) > 0
    if (hayFilas && !confirm('Se reemplaza la tabla por lo que dicen las órdenes (se pierden los cambios hechos a mano en la tabla). ¿Seguir?')) return
    setCargando(true); setError(null)
    try {
      const res = await fetch(`/api/plantillas/fuentes?fuente=ordenes&tipo=${tipo}&desde=${desde}&hasta=${hasta}&cantidad=${cantidad}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron leer las órdenes')
      const periodo = datos.desde === desde && datos.hasta === hasta ? datos.periodo : labelRango(desde, hasta)
      set({ desde, hasta, cantidad, periodo, compras: data.compras })
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
      <Encabezado datos={datos} set={set} phTitulo={fondos ? 'Los fondos más comprados' : 'Los bonos más comprados'} />

      <div>
        <p className={tituloCls}>Órdenes del período <span className="normal-case tracking-normal font-normal">— el ranking sale solo de las órdenes enviadas (<Link href="/mas-operado" className="text-blue-600 hover:underline">ver detalle</Link>)</span></p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Mes</label>
            <input type="month" className={input} value={mes} max={hoyMontevideo().slice(0, 7)} onChange={(e) => elegirMes(e.target.value)} disabled={cargando} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>Cantidad de {fondos ? 'fondos' : 'bonos'}</label>
            <select className={input} value={datos.cantidad || 5} disabled={cargando || !datos.desde}
              onChange={(e) => cargar(datos.desde, datos.hasta, Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
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
      {fondos && <p className="text-[11px] text-gray-400 -mt-3">Los rendimientos (en %) salen del Monitor de fondos o de Davinci; los que no se completen se pueden escribir a mano debajo de cada fondo. “Volver a cargar” los reemplaza por los automáticos.</p>}

      <div>
        <p className={tituloCls}>Texto de abajo</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Título" value={datos.vision_titulo} placeholder="Nuestra visión" onChange={(v) => set({ vision_titulo: v })} />
          <div className="col-span-2">
            <label className={labelCls}>Visión de mercado y por qué los cambios <span className="text-gray-400 font-normal">— dejá una línea en blanco entre párrafos</span></label>
            <textarea
              rows={7}
              className={`${input} resize-y ${!datos.vision?.trim() ? 'border-amber-300' : ''}`}
              value={datos.vision ?? ''}
              placeholder={fondos ? 'Cómo vemos el mercado, por qué rotamos fondos este mes…' : 'Cómo vemos las tasas y el crédito, por qué compramos estos bonos…'}
              onChange={(e) => set({ vision: e.target.value })}
            />
          </div>
        </div>
      </div>
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
              <Fragment key={i}>
              <tr>
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
              {tipo === 'mas_operado_fondos' && (
                <tr>
                  <td />
                  <td colSpan={cols.length + 1} className="pb-2 pt-0.5">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4 }}>
                      {COLUMNAS_REND_FONDO.map((c) => (
                        <label key={c.key} className="flex flex-col">
                          <span className="text-[9px] text-gray-400 uppercase">{c.label}</span>
                          <RendInput valor={f[c.key] ?? null} onChange={(v) => onChange(filas.map((x, j) => (j === i ? { ...x, [c.key]: v } : x)))} />
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
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

// Rendimiento en %: acepta "5,23", "5.23", "-3,1%" o vacío. Guarda el número
// (o null) mientras se escribe, sin perder la coma a medio tipear.
function parseRend(t: string): number | null | undefined {
  const s = t.trim().replace('%', '').replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  return /^[-+]?\d*\.?\d+$/.test(s) ? Number(s) : undefined   // undefined = todavía no es un número
}

function RendInput({ valor, onChange }: { valor: number | null; onChange: (v: number | null) => void }) {
  const fmt = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const [txt, setTxt] = useState(fmt(valor))
  useEffect(() => {
    if (parseRend(txt) !== valor) setTxt(fmt(valor))   // cambió desde afuera (p. ej. volver a cargar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  const invalido = parseRend(txt) === undefined
  return (
    <input
      inputMode="decimal"
      className={`${celda} text-right tabular-nums ${invalido ? 'border-red-300' : ''}`}
      value={txt}
      placeholder="—"
      onChange={(e) => {
        setTxt(e.target.value)
        const v = parseRend(e.target.value)
        if (v !== undefined) onChange(v)
      }}
    />
  )
}
