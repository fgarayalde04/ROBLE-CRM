'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClaseActivo, InstrumentoOperado, RankingMasOperado } from '@/lib/db/masOperado'
import { hoyMontevideo, moverPeriodo, periodoDe, type Periodo, type TipoPeriodo } from '@/lib/masOperado/periodos'

const CLASES: { key: ClaseActivo; label: string; plantilla?: string }[] = [
  { key: 'fondos', label: 'Fondos', plantilla: 'mas_operado_fondos' },
  { key: 'bonos', label: 'Bonos', plantilla: 'mas_operado_bonos' },
  { key: 'acciones', label: 'Acciones' },
]

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)

export default function MasOperadoClient({ puedeCrearPlantilla }: { puedeCrearPlantilla: boolean }) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes', hoyMontevideo()))
  const [clase, setClase] = useState<ClaseActivo>('fondos')
  const [ranking, setRanking] = useState<RankingMasOperado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError(null)
    fetch(`/api/mas-operado?desde=${periodo.desde}&hasta=${periodo.hasta}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error')
        if (vigente) setRanking(data.ranking)
      })
      .catch((e) => { if (vigente) setError(e.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [periodo])

  const cambiarTipo = (t: TipoPeriodo) => setPeriodo(periodoDe(t, t === periodo.tipo ? periodo.desde : hoyMontevideo()))
  const esActual = periodo.desde === periodoDe(periodo.tipo, hoyMontevideo()).desde
  const datos = ranking?.[clase]
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
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Lo más operado</h1>
        <p className="mt-1 text-sm text-gray-500">
          Lo que más se compró y vendió en la empresa, según las órdenes enviadas desde la plataforma (sin canceladas, devueltas ni rechazadas por el cliente).
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-sm">
          {(['mes', 'semana'] as TipoPeriodo[]).map((t) => (
            <button
              key={t} type="button" onClick={() => cambiarTipo(t)}
              className={`px-3 py-1 rounded ${periodo.tipo === t ? 'bg-[#2D3F52] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t === 'mes' ? 'Por mes' : 'Por semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPeriodo(moverPeriodo(periodo, -1))} className="px-2 py-1 text-sm border border-gray-200 bg-white rounded hover:bg-gray-50" aria-label="Período anterior">←</button>
          <span className="px-2 text-sm font-medium text-gray-800 min-w-[200px] text-center">{periodo.label}</span>
          <button type="button" onClick={() => setPeriodo(moverPeriodo(periodo, 1))} disabled={esActual} className="px-2 py-1 text-sm border border-gray-200 bg-white rounded hover:bg-gray-50 disabled:opacity-30" aria-label="Período siguiente">→</button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 border-b border-gray-200">
        <div className="flex gap-1">
          {CLASES.map((c) => {
            const t = ranking?.[c.key]?.totales
            return (
              <button
                key={c.key} type="button" onClick={() => setClase(c.key)}
                className={`px-4 py-2 text-sm -mb-px border-b-2 ${clase === c.key ? 'border-[#2D3F52] text-[#2D3F52] font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {c.label}
                {t && <span className="ml-1.5 text-xs font-normal text-gray-400">{t.compras + t.ventas}</span>}
              </button>
            )
          })}
        </div>
        {puedeCrearPlantilla && plantilla && (
          <button
            type="button" onClick={armarPlantilla} disabled={creando || cargando || !datos || datos.compras.length + datos.ventas.length === 0}
            className="mb-2 px-3 py-1.5 text-sm bg-[#2D3F52] text-white rounded-md hover:bg-[#354A5E] disabled:opacity-40"
          >
            {creando ? 'Creando…' : `Armar plantilla de ${clase} más operados`}
          </button>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : cargando && !ranking ? (
        <p className="text-sm text-gray-400">Calculando…</p>
      ) : datos ? (
        <div className={`grid grid-cols-1 xl:grid-cols-2 gap-4 ${cargando ? 'opacity-60' : ''}`}>
          <Tabla titulo="Más comprados" total={datos.totales.compras} filas={datos.compras} clase={clase} />
          <Tabla titulo="Más vendidos" total={datos.totales.ventas} filas={datos.ventas} clase={clase} />
        </div>
      ) : null}
    </div>
  )
}

function Tabla({ titulo, total, filas, clase }: { titulo: string; total: number; filas: InstrumentoOperado[]; clase: ClaseActivo }) {
  const th = 'px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap'
  const td = 'px-3 py-2 text-gray-600 whitespace-nowrap'
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        <span className="text-xs text-gray-400">{total} {total === 1 ? 'operación' : 'operaciones'}</span>
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Sin operaciones en el período.</p>
      ) : (
        <div className="mobile-scroll-x">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={th}>#</th>
                <th className={th}>{clase === 'fondos' ? 'Fondo' : clase === 'bonos' ? 'Bono' : 'Acción'}</th>
                {clase === 'fondos' && <><th className={th}>Clase</th><th className={th}>Moneda</th><th className={`${th} text-right`}>YTD</th></>}
                {clase === 'bonos' && <><th className={th}>Cupón</th><th className={th}>Vencimiento</th><th className={th}>Moneda</th></>}
                {clase === 'acciones' && <th className={th}>Moneda</th>}
                <th className={`${th} text-right`}>Órdenes</th>
                <th className={`${th} text-right`}>Clientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((f, i) => (
                <tr key={f.key} className="hover:bg-gray-50">
                  <td className={`${td} text-gray-400`}>{i + 1}</td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <p className="font-medium text-gray-900">{f.nombre}</p>
                    {(f.isin || f.ticker) && <p className="text-xs text-gray-400">{clase === 'acciones' ? f.ticker || f.isin : f.isin}</p>}
                  </td>
                  {clase === 'fondos' && <><td className={td}>{f.clase || '—'}</td><td className={td}>{f.moneda || '—'}</td><td className={`${td} text-right`}>{pct(f.r_ytd)}</td></>}
                  {clase === 'bonos' && <><td className={td}>{f.cupon || '—'}</td><td className={td}>{f.vencimiento || '—'}</td><td className={td}>{f.moneda || '—'}</td></>}
                  {clase === 'acciones' && <td className={td}>{f.moneda || '—'}</td>}
                  <td className={`${td} text-right font-semibold text-gray-900`}>{f.operaciones}</td>
                  <td className={`${td} text-right`}>{f.clientes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
