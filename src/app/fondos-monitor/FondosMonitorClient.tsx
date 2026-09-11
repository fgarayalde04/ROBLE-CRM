'use client'
import { useMemo, useState } from 'react'

interface FundRow {
  id: string
  isin: string
  nombre: string
  moneda: string | null
  categoria: string | null
  subcategoria: string | null
  as_of_date: string | null
  r_1m: number | null
  r_3m: number | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
  source: string | null
  status: 'ok' | 'stale' | 'no_source' | 'error' | null
  error_message: string | null
  fetched_at: string | null
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function pctColor(n: number | null) {
  if (n == null) return 'text-gray-300'
  return n >= 0 ? 'text-emerald-600' : 'text-red-500'
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ok:         { label: 'OK',         color: 'bg-emerald-50 text-emerald-700' },
  stale:      { label: 'STALE',      color: 'bg-amber-50 text-amber-700' },
  no_source:  { label: 'SIN FUENTE', color: 'bg-gray-100 text-gray-500' },
  error:      { label: 'ERROR',      color: 'bg-red-50 text-red-600' },
}

const COLS: { key: keyof FundRow; label: string }[] = [
  { key: 'r_1m', label: '1M' },
  { key: 'r_3m', label: '3M' },
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

export default function FondosMonitorClient({ funds }: { funds: FundRow[] }) {
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? funds.filter(f => f.nombre.toLowerCase().includes(q) || f.isin.toLowerCase().includes(q))
      : funds
    const map = new Map<string, FundRow[]>()
    for (const f of filtered) {
      const key = f.categoria ?? 'Sin categoría'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }
    return map
  }, [funds, search])

  const lastUpdate = funds
    .map(f => f.fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Monitor de Fondos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {funds.length} fondos · Última actualización: {lastUpdate ? new Date(lastUpdate).toLocaleString('es-UY') : '—'}
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o ISIN…"
          className="w-72 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
        />
      </div>

      {Array.from(grouped.entries()).map(([categoria, rows]) => (
        <div key={categoria} className="mb-6">
          <p className="text-xs font-bold text-[#1B3A2B] uppercase tracking-wide mb-2">{categoria}</p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr style={{ backgroundColor: '#1B2E3C' }}>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wide">Nombre</th>
                    {COLS.map(c => (
                      <th key={c.key} className="px-2 py-2 text-right text-[10px] font-bold text-white uppercase tracking-wide w-16">{c.label}</th>
                    ))}
                    <th className="px-2 py-2 text-center text-[10px] font-bold text-white uppercase tracking-wide w-20">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f, i) => {
                    const st = STATUS_LABEL[f.status ?? 'no_source']
                    return (
                      <tr key={f.id} className={i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} title={f.error_message ?? undefined}>
                        <td className="px-3 py-2 border-b border-gray-100">
                          <div className="font-medium text-gray-800 text-xs">{f.nombre}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {f.isin} · {f.moneda ?? '—'}
                            {f.subcategoria && ` · ${f.subcategoria}`}
                            {f.as_of_date && ` · datos al ${fmtDate(f.as_of_date)}`}
                          </div>
                        </td>
                        {COLS.map(c => (
                          <td key={c.key} className={`px-2 py-2 text-right text-xs border-b border-gray-100 ${pctColor(f[c.key] as number | null)}`}>
                            {fmtPct(f[c.key] as number | null)}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center border-b border-gray-100">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
