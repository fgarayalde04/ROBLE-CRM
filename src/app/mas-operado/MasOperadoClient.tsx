'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClaseActivo, InstrumentoOperado, Lado, RankingMasOperado } from '@/lib/db/masOperado'
import { hoyMontevideo, moverPeriodo, periodoDe, type Periodo, type TipoPeriodo } from '@/lib/masOperado/periodos'

const CLASES: { key: ClaseActivo; label: string; plantilla?: string }[] = [
  { key: 'fondos', label: 'Fondos', plantilla: 'mas_operado_fondos' },
  { key: 'bonos', label: 'Bonos', plantilla: 'mas_operado_bonos' },
  { key: 'acciones', label: 'Acciones' },
]

const segmento = (activo: boolean) =>
  `px-3 py-1 rounded ${activo ? 'bg-[#2D3F52] text-white' : 'text-gray-600 hover:bg-gray-50'}`

export default function MasOperadoClient({ puedeCrearPlantilla }: { puedeCrearPlantilla: boolean }) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('todo', hoyMontevideo()))
  const [clase, setClase] = useState<ClaseActivo>('fondos')
  const [lado, setLado] = useState<Lado>('compra')
  const [unir, setUnir] = useState(true)
  const [ranking, setRanking] = useState<RankingMasOperado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError(null)
    fetch(`/api/mas-operado?desde=${periodo.desde}&hasta=${periodo.hasta}&unir=${unir ? 1 : 0}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error')
        if (vigente) setRanking(data.ranking)
      })
      .catch((e) => { if (vigente) setError(e.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [periodo, unir])

  const cambiarTipo = (t: TipoPeriodo) => setPeriodo(periodoDe(t, t === periodo.tipo ? periodo.desde : hoyMontevideo()))
  const esActual = periodo.desde === periodoDe(periodo.tipo, hoyMontevideo()).desde
  const datos = ranking?.[clase]
  const filas = datos ? (lado === 'compra' ? datos.compras : datos.ventas) : []
  const plantilla = CLASES.find((c) => c.key === clase)?.plantilla

  async function armarPlantilla() {
    if (!plantilla) return
    setCreando(true)
    try {
      const res = await fetch('/api/plantillas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: plantilla, desde: periodo.desde, hasta: periodo.hasta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear')
      router.push(`/plantillas/${data.documento.id}`)
    } catch (e: any) {
      alert(e.message)
      setCreando(false)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lo más operado</h1>
          <p className="mt-1 text-sm text-gray-500">
            Lo que más se compró y vendió en la empresa: cuenta las mismas líneas que el Blotter (cada activo de cada orden), sin las canceladas.
          </p>
        </div>
        {puedeCrearPlantilla && plantilla && (
          <button
            type="button" onClick={armarPlantilla} disabled={creando || cargando || !datos || datos.compras.length + datos.ventas.length === 0}
            className="px-3 py-1.5 text-sm bg-[#2D3F52] text-white rounded-md hover:bg-[#354A5E] disabled:opacity-40"
          >
            {creando ? 'Creando…' : `Armar plantilla de ${clase} más comprados`}
          </button>
        )}
      </div>

      {/* Filtros en una sola línea: período · tipo de activo · compras/ventas · unir fondos */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-x-6 gap-y-3 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 p-0.5">
            {(['todo', 'mes', 'semana'] as TipoPeriodo[]).map((t) => (
              <button key={t} type="button" onClick={() => cambiarTipo(t)} className={segmento(periodo.tipo === t)}>
                {t === 'todo' ? 'Todo hasta hoy' : t === 'mes' ? 'Por mes' : 'Por semana'}
              </button>
            ))}
          </div>
          {periodo.tipo !== 'todo' && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPeriodo(moverPeriodo(periodo, -1))} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50" aria-label="Período anterior">←</button>
              <span className="px-2 font-medium text-gray-800 min-w-[180px] text-center">{periodo.label}</span>
              <button type="button" onClick={() => setPeriodo(moverPeriodo(periodo, 1))} disabled={esActual} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30" aria-label="Período siguiente">→</button>
            </div>
          )}
        </div>

        <div className="inline-flex rounded-md border border-gray-200 p-0.5">
          {CLASES.map((c) => {
            const t = ranking?.[c.key]?.totales
            return (
              <button key={c.key} type="button" onClick={() => setClase(c.key)} className={segmento(clase === c.key)}>
                {c.label}{t && <span className="ml-1.5 text-xs opacity-60">{t.compras + t.ventas}</span>}
              </button>
            )
          })}
        </div>

        <div className="inline-flex rounded-md border border-gray-200 p-0.5">
          {(['compra', 'venta'] as Lado[]).map((l) => (
            <button key={l} type="button" onClick={() => setLado(l)} className={segmento(lado === l)}>
              {l === 'compra' ? 'Más comprados' : 'Más vendidos'}
              {datos && <span className="ml-1.5 text-xs opacity-60">{l === 'compra' ? datos.totales.compras : datos.totales.ventas}</span>}
            </button>
          ))}
        </div>

        {clase === 'fondos' && (
          <label className="flex items-center gap-2 text-gray-600" title="Las distintas versiones de un mismo fondo (A, E, Inst, Acc, Dist, moneda…) cuentan como un solo fondo">
            <input type="checkbox" checked={unir} onChange={(e) => setUnir(e.target.checked)} />
            Unir el mismo fondo
          </label>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : cargando && !ranking ? (
        <p className="text-sm text-gray-400">Calculando…</p>
      ) : datos ? (
        <div className={cargando ? 'opacity-60' : ''}>
          <Tabla filas={filas} clase={clase} />
        </div>
      ) : null}
    </div>
  )
}

// Mismo estilo que la tabla del Monitor de fondos
const COLS_REND: { key: 'r_1y' | 'r_3y' | 'r_5y' | 'r_ytd' | 'y_2025' | 'y_2024' | 'y_2023' | 'y_2022' | 'y_2021'; label: string }[] = [
  { key: 'r_1y', label: '1A' },
  { key: 'r_3y', label: '3A' },
  { key: 'r_5y', label: '5A' },
  { key: 'r_ytd', label: 'YTD' },
  { key: 'y_2025', label: '2025' },
  { key: 'y_2024', label: '2024' },
  { key: 'y_2023', label: '2023' },
  { key: 'y_2022', label: '2022' },
  { key: 'y_2021', label: '2021' },
]

const fmtRend = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`)
const colorRend = (n: number | null | undefined) => (n == null ? 'text-gray-300' : n >= 0 ? 'text-emerald-600' : 'text-red-500')

function Tabla({ filas, clase }: { filas: InstrumentoOperado[]; clase: ClaseActivo }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternar = (k: string) => setAbiertos((a) => {
    const n = new Set(a)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const th = 'px-2 py-2 text-[10px] font-bold text-white uppercase tracking-wide whitespace-nowrap'
  const td = 'px-2 py-2 text-xs border-b border-gray-100 whitespace-nowrap'
  const max = Math.max(1, ...filas.map((f) => f.operaciones))
  const fondos = clase === 'fondos'
  const columnas = 4 + (fondos ? COLS_REND.length : clase === 'bonos' ? 3 : 1)

  if (filas.length === 0) {
    return <p className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-sm text-gray-400">Sin operaciones en el período.</p>
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr style={{ backgroundColor: '#1B2E3C' }}>
            <th className={`${th} text-center w-10`}>#</th>
            <th className={`${th} text-left px-3`}>{fondos ? 'Fondo' : clase === 'bonos' ? 'Bono' : 'Ticker'}</th>
            {fondos && COLS_REND.map((c) => (
              <th key={c.key} className={`${th} text-center w-[5.6%]`} style={c.key === 'r_ytd' ? { backgroundColor: '#2E7D52' } : undefined}>{c.label}</th>
            ))}
            {clase === 'bonos' && <><th className={`${th} text-center`}>Cupón</th><th className={`${th} text-center`}>Vencimiento</th><th className={`${th} text-center`}>Moneda</th></>}
            {clase === 'acciones' && <th className={`${th} text-center`}>Moneda</th>}
            <th className={`${th} text-left w-[18%]`}>Órdenes</th>
            <th className={`${th} text-center w-20`}>Clientes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const variantes = f.variantes ?? []
            const abierto = abiertos.has(f.key)
            const nombre = clase === 'acciones' ? (f.ticker || f.nombre).toUpperCase() : f.nombre
            const fondo = i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
            return (
              <Fragment key={f.key}>
                <tr className={`${fondo} hover:bg-[#1B3A2B]/[0.03] cursor-pointer`} onClick={() => alternar(f.key)} title="Ver el detalle">
                  <td className={`${td} text-center text-gray-400`}>{i + 1}</td>
                  <td className={`${td} px-3 whitespace-normal`}>
                    <span className="inline-block w-3 text-[10px] text-gray-400">{abierto ? '▾' : '▸'}</span>
                    <span className="font-medium text-gray-800">{nombre}</span>
                  </td>
                  {fondos && COLS_REND.map((c) => {
                    const v = f.rendimientos?.[c.key]
                    return (
                      <td key={c.key} className={`${td} text-center tabular-nums ${colorRend(v)} ${c.key === 'r_ytd' ? 'bg-emerald-50/60 font-semibold' : ''}`}>{fmtRend(v)}</td>
                    )
                  })}
                  {clase === 'bonos' && <><td className={`${td} text-center text-gray-600`}>{f.cupon || '—'}</td><td className={`${td} text-center text-gray-600`}>{f.vencimiento || '—'}</td><td className={`${td} text-center text-gray-600`}>{f.moneda || '—'}</td></>}
                  {clase === 'acciones' && <td className={`${td} text-center text-gray-600`}>{f.moneda || '—'}</td>}
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(f.operaciones / max) * 100}%`, backgroundColor: '#1B3A2B' }} />
                      </div>
                      <span className="w-7 text-right font-semibold text-gray-900 tabular-nums">{f.operaciones}</span>
                    </div>
                  </td>
                  <td className={`${td} text-center tabular-nums text-gray-600`}>{f.clientes}</td>
                </tr>
                {abierto && (
                  <tr className="bg-gray-50">
                    <td />
                    <td colSpan={columnas - 1} className="px-3 py-2 border-b border-gray-100">
                      <div className="space-y-1">
                        {variantes.map((v) => (
                          <div key={`${v.isin}-${v.nombre}`} className="flex items-center gap-4 text-[11px] text-gray-600">
                            <span className="flex-1 min-w-0">{v.nombre}</span>
                            <span className="font-mono text-gray-500 w-32">{v.isin || 'sin ISIN'}</span>
                            <span className="text-gray-400 w-10">{v.moneda || '—'}</span>
                            <span className="tabular-nums w-20 text-right">{v.operaciones} {v.operaciones === 1 ? 'orden' : 'órdenes'}</span>
                          </div>
                        ))}
                        {fondos && (
                          <p className="text-[10px] text-gray-400 pt-1">
                            {f.rendimientos
                              ? `Rendimientos: ${f.rendimientos.fuente}${f.rendimientos.fecha ? ` · datos al ${f.rendimientos.fecha}` : ''}`
                              : 'Sin rendimientos guardados: se buscan en Davinci al generar el reporte.'}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
