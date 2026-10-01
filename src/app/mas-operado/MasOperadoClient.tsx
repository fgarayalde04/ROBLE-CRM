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

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)

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
            Lo que más se compró y vendió en la empresa, según las órdenes enviadas desde la plataforma (sin canceladas, devueltas ni rechazadas por el cliente).
          </p>
        </div>
        {puedeCrearPlantilla && plantilla && (
          <button
            type="button" onClick={armarPlantilla} disabled={creando || cargando || !datos || datos.compras.length + datos.ventas.length === 0}
            className="px-3 py-1.5 text-sm bg-[#2D3F52] text-white rounded-md hover:bg-[#354A5E] disabled:opacity-40"
          >
            {creando ? 'Creando…' : `Armar plantilla de ${clase} más operados`}
          </button>
        )}
      </div>

      {/* Filtros en una sola línea: período · tipo de activo · compras/ventas · unir clases */}
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
          <label className="flex items-center gap-2 text-gray-600" title="Las distintas clases de un mismo fondo (A, E, Inst, Acc, Dist, moneda…) cuentan como un solo fondo">
            <input type="checkbox" checked={unir} onChange={(e) => setUnir(e.target.checked)} />
            Unir clases del mismo fondo
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

function Tabla({ filas, clase }: { filas: InstrumentoOperado[]; clase: ClaseActivo }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternar = (k: string) => setAbiertos((a) => {
    const n = new Set(a)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const th = 'px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap'
  const td = 'px-4 py-2.5 text-gray-600 whitespace-nowrap'
  const max = Math.max(1, ...filas.map((f) => f.operaciones))

  if (filas.length === 0) {
    return <p className="bg-white rounded-lg border border-gray-200 px-4 py-6 text-sm text-gray-400">Sin operaciones en el período.</p>
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 mobile-scroll-x">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/60">
          <tr>
            <th className={`${th} w-10`}>#</th>
            <th className={th}>{clase === 'fondos' ? 'Fondo' : clase === 'bonos' ? 'Bono' : 'Acción'}</th>
            <th className={th}>{clase === 'acciones' ? 'Ticker' : 'ISIN'}</th>
            {clase === 'fondos' && <><th className={th}>Clase</th><th className={th}>Moneda</th><th className={`${th} text-right`}>YTD</th><th className={`${th} text-right`}>1 año</th></>}
            {clase === 'bonos' && <><th className={th}>Cupón</th><th className={th}>Vencimiento</th><th className={th}>Moneda</th></>}
            {clase === 'acciones' && <th className={th}>Moneda</th>}
            <th className={`${th} w-[22%]`}>Órdenes</th>
            <th className={`${th} text-right`}>Clientes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filas.map((f, i) => {
            const variantes = f.variantes ?? []
            const abierto = abiertos.has(f.key)
            return (
              <Fragment key={f.key}>
                <tr className="hover:bg-gray-50">
                  <td className={`${td} text-gray-400`}>{i + 1}</td>
                  <td className="px-4 py-2.5">
                    {variantes.length > 0 ? (
                      <button type="button" onClick={() => alternar(f.key)} className="text-left font-medium text-gray-900 hover:text-[#2D3F52] hover:underline" title="Ver el detalle por clase">
                        <span className="inline-block w-3 text-gray-400">{abierto ? '▾' : '▸'}</span>{f.nombre}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-900">{f.nombre}</span>
                    )}
                  </td>
                  <td className={`${td} text-xs text-gray-500`}>
                    {variantes.length > 1
                      ? <span className="text-gray-400">{variantes.length} clases</span>
                      : (clase === 'acciones' ? f.ticker || f.isin : f.isin) || '—'}
                  </td>
                  {clase === 'fondos' && <><td className={td}>{variantes.length > 1 && new Set(variantes.map((v) => v.clase)).size > 1 ? 'Varias' : f.clase || '—'}</td><td className={td}>{f.moneda || '—'}</td><td className={`${td} text-right tabular-nums`}>{pct(f.r_ytd)}</td><td className={`${td} text-right tabular-nums`}>{pct(f.r_1y)}</td></>}
                  {clase === 'bonos' && <><td className={td}>{f.cupon || '—'}</td><td className={td}>{f.vencimiento || '—'}</td><td className={td}>{f.moneda || '—'}</td></>}
                  {clase === 'acciones' && <td className={td}>{f.moneda || '—'}</td>}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2D3F52] rounded-full" style={{ width: `${(f.operaciones / max) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right font-semibold text-gray-900 tabular-nums">{f.operaciones}</span>
                    </div>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{f.clientes}</td>
                </tr>
                {abierto && variantes.map((v) => (
                  <tr key={`${f.key}-${v.isin || v.nombre}`} className="bg-gray-50/70 text-xs">
                    <td />
                    <td className="px-4 py-1.5 pl-7 text-gray-600">{v.nombre}</td>
                    <td className="px-4 py-1.5 text-gray-500">{v.isin || '—'}</td>
                    <td className="px-4 py-1.5 text-gray-500">{v.clase || '—'}</td>
                    <td className="px-4 py-1.5 text-gray-500">{v.moneda || '—'}</td>
                    <td colSpan={2} />
                    <td className="px-4 py-1.5 text-gray-600"><span className="inline-block w-full text-right pr-0.5 tabular-nums">{v.operaciones}</span></td>
                    <td />
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
