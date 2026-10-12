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

export default function MasOperadoClient({ puedeCrearPlantilla, puedeUnir }: { puedeCrearPlantilla: boolean; puedeUnir: boolean }) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('todo', hoyMontevideo()))
  const [clase, setClase] = useState<ClaseActivo>('fondos')
  const [lado, setLado] = useState<Lado>('compra')
  const [unir, setUnir] = useState(true)
  const [ranking, setRanking] = useState<RankingMasOperado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [recarga, setRecarga] = useState(0)

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
  }, [periodo, unir, recarga])

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
          <Tabla
            filas={filas} clase={clase} puedeUnir={puedeUnir}
            otros={ranking ? [...ranking.fondos.compras, ...ranking.fondos.ventas] : []}
            onCambio={() => setRecarga((n) => n + 1)}
          />
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

function Tabla({ filas, clase, puedeUnir, otros, onCambio }: {
  filas: InstrumentoOperado[]; clase: ClaseActivo; puedeUnir: boolean; otros: InstrumentoOperado[]; onCambio: () => void
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [uniendo, setUniendo] = useState<string | null>(null)   // fila con el buscador de "Unir con…" abierto
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

  async function separar(clave: string) {
    const res = await fetch('/api/mas-operado/uniones', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claves: [clave] }),
    })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'No se pudo separar'); return }
    onCambio()
  }

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
                    {fondos && puedeUnir && (
                      <button
                        type="button" title="Unir con otro fondo operado o del Monitor de fondos"
                        onClick={(e) => { e.stopPropagation(); setAbiertos((a) => new Set(a).add(f.key)); setUniendo(f.key) }}
                        className="ml-2 px-1.5 py-0.5 text-[10px] text-[#2D3F52] border border-gray-200 rounded hover:bg-gray-100"
                      >
                        Unir con…
                      </button>
                    )}
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
                            {fondos && puedeUnir && (
                              v.unido
                                ? <button type="button" onClick={() => separar(v.clave)} className="w-14 text-right text-[10px] text-gray-400 hover:text-red-600" title="Sacarlo de la unión hecha a mano">Separar</button>
                                : <span className="w-14" />
                            )}
                          </div>
                        ))}
                        {fondos && puedeUnir && <UnirCon fila={f} otros={otros} onCambio={onCambio} abierto={uniendo === f.key} setAbierto={(v) => setUniendo(v ? f.key : null)} />}
                        {fondos && (
                          <p className="text-[10px] text-gray-400 pt-1">
                            {f.rendimientos
                              ? `Rendimientos: ${f.rendimientos.fuente}${f.rendimientos.fecha ? ` · datos al ${f.rendimientos.fecha}` : ''}`
                              : 'Sin rendimientos todavía: no está en el Monitor; se busca en Davinci el último día del mes y queda guardado. Si es el mismo fondo que otro con datos, unilo con ese.'}
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

type FondoMonitor = { id: string; nombre: string; isin: string }
let monitorCache: Promise<FondoMonitor[]> | null = null
const cargarMonitor = () => (monitorCache ??= fetch('/api/mas-operado/uniones')
  .then((r) => r.json())
  .then((d) => (d.monitor ?? []) as FondoMonitor[])
  .catch(() => { monitorCache = null; return [] }))

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// "Unir con…": la fila (todas sus clases) pasa a contar junto con otro fondo
// operado o con uno del Monitor de fondos, del que toma nombre y rendimientos.
function UnirCon({ fila, otros, onCambio, abierto, setAbierto }: {
  fila: InstrumentoOperado; otros: InstrumentoOperado[]; onCambio: () => void; abierto: boolean; setAbierto: (v: boolean) => void
}) {
  const [texto, setTexto] = useState('')
  const [monitor, setMonitor] = useState<FondoMonitor[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { if (abierto) cargarMonitor().then(setMonitor) }, [abierto])

  const propias = new Set((fila.variantes ?? []).map((v) => v.clave))
  const q = sinAcentos(texto.trim())
  const coincide = (...t: string[]) => !q || t.some((x) => sinAcentos(x).includes(q))
  const operados = Array.from(new Map(otros.map((o) => [o.key, o])).values())
    .filter((o) => o.key !== fila.key && (o.variantes ?? []).some((v) => !propias.has(v.clave)))
    .filter((o) => coincide(o.nombre, ...(o.variantes ?? []).flatMap((v) => [v.nombre, v.isin])))
    .slice(0, 8)
  const delMonitor = monitor
    .filter((m) => `mon:${m.id}` !== fila.grupo && coincide(m.nombre, m.isin))
    .slice(0, 8)

  async function unir(con: { claves: string[] } | { monitorId: string }) {
    setGuardando(true)
    try {
      const res = await fetch('/api/mas-operado/uniones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claves: Array.from(propias), con }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo unir')
      setAbierto(false)
      setTexto('')
      onCambio()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-1 text-[11px] text-[#2D3F52] hover:underline">
        Unir con…
      </button>
    )
  }
  const opcion = 'w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-3 disabled:opacity-40'
  return (
    <div className="mt-2 max-w-xl bg-white border border-gray-200 rounded-md p-2 text-[11px]">
      <div className="flex items-center gap-2 mb-1">
        <input
          autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar fondo por nombre o ISIN"
          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
        />
        <button type="button" onClick={() => setAbierto(false)} className="text-gray-400 hover:text-gray-700">Cancelar</button>
      </div>
      {operados.length > 0 && <p className="px-2 pt-1 text-[10px] font-semibold uppercase text-gray-400">Fondos operados</p>}
      {operados.map((o) => (
        <button
          key={o.key} type="button" disabled={guardando} className={opcion}
          onClick={() => unir({ claves: (o.variantes ?? []).map((v) => v.clave) })}
        >
          <span className="flex-1 min-w-0 truncate">{o.nombre}</span>
          <span className="font-mono text-gray-400">{o.isin || 'sin ISIN'}</span>
        </button>
      ))}
      {delMonitor.length > 0 && <p className="px-2 pt-1 text-[10px] font-semibold uppercase text-gray-400">Monitor de fondos</p>}
      {delMonitor.map((m) => (
        <button key={m.id} type="button" disabled={guardando} className={opcion} onClick={() => unir({ monitorId: m.id })}>
          <span className="flex-1 min-w-0 truncate">{m.nombre}</span>
          <span className="font-mono text-gray-400">{m.isin || 'sin ISIN'}</span>
        </button>
      ))}
      {!operados.length && !delMonitor.length && <p className="px-2 py-1 text-gray-400">Sin resultados.</p>}
    </div>
  )
}
