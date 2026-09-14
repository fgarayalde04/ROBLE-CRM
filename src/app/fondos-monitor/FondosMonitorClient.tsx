'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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

// Los fondos llegan ya en el orden del Excel (sort_order) — agrupar
// simplemente por orden de aparición reproduce esa misma estructura de
// categoría → subcategoría, sin necesidad de un orden fijo a mano.
function groupInOrder<T>(items: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = []
  const byKey = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    let arr = byKey.get(key)
    if (!arr) { arr = []; byKey.set(key, arr); groups.push({ key, items: arr }) }
    arr.push(item)
  }
  return groups
}

const CATEGORIAS_CONOCIDAS = [
  'RENTA FIJA', 'BALANCEADOS / MULTI-ASSET', 'ALTERNATIVOS', 'RENTA VARIABLE', 'REAL ESTATE', 'COMMODITIES',
]

export default function FondosMonitorClient({ funds }: { funds: FundRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? funds.filter(f => f.nombre.toLowerCase().includes(q) || f.isin.toLowerCase().includes(q))
      : funds
    return groupInOrder(filtered, f => f.categoria ?? 'Sin categoría')
  }, [funds, search])

  // Listas conocidas para los selects del alta: categorías fijas del Excel
  // primero, más cualquier otra que ya haya aparecido en los datos; las
  // subcategorías se ordenan por categoría a partir de lo que ya existe.
  const categoriasDisponibles = useMemo(() => {
    const existentes = Array.from(new Set(funds.map(f => f.categoria).filter((c): c is string => !!c)))
    return Array.from(new Set([...CATEGORIAS_CONOCIDAS, ...existentes]))
  }, [funds])

  const subcategoriasPorCategoria = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const f of funds) {
      if (!f.categoria || !f.subcategoria) continue
      const arr = map.get(f.categoria) ?? []
      if (!arr.includes(f.subcategoria)) arr.push(f.subcategoria)
      map.set(f.categoria, arr)
    }
    return map
  }, [funds])

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
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ISIN…"
            className="w-72 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
          />
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm font-medium px-3 py-2 rounded-lg text-white whitespace-nowrap"
            style={{ backgroundColor: '#1B3A2B' }}
          >
            + Agregar fondo
          </button>
        </div>
      </div>

      {showAdd && (
        <AddFundModal
          categoriasDisponibles={categoriasDisponibles}
          subcategoriasPorCategoria={subcategoriasPorCategoria}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false)
            router.refresh()
          }}
        />
      )}

      {grouped.map(({ key: categoria, items: catRows }) => {
        const subgroups = groupInOrder(catRows, f => f.subcategoria ?? '')
        return (
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
                  {subgroups.map(({ key: subcategoria, items: rows }) => (
                    <tbody key={subcategoria || '_'}>
                      {subcategoria && (
                        <tr>
                          <td colSpan={COLS.length + 2} className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wide bg-[#2E7D52]">
                            {subcategoria}
                          </td>
                        </tr>
                      )}
                      {rows.map((f, i) => {
                        const st = STATUS_LABEL[f.status ?? 'no_source']
                        return (
                          <tr key={f.id} className={i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} title={f.error_message ?? undefined}>
                            <td className="px-3 py-2 border-b border-gray-100">
                              <div className="font-medium text-gray-800 text-xs">{f.nombre}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {f.isin} · {f.moneda ?? '—'}
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
                  ))}
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const OTRA = '__otra__'

function AddFundModal({
  categoriasDisponibles,
  subcategoriasPorCategoria,
  onClose,
  onCreated,
}: {
  categoriasDisponibles: string[]
  subcategoriasPorCategoria: Map<string, string[]>
  onClose: () => void
  onCreated: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState(categoriasDisponibles[0] ?? '')
  const [categoriaOtra, setCategoriaOtra] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [subcategoriaOtra, setSubcategoriaOtra] = useState('')
  const [isin, setIsin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subOptions = subcategoriasPorCategoria.get(categoria) ?? []
  const categoriaFinal = categoria === OTRA ? categoriaOtra.trim() : categoria
  const subcategoriaFinal = subcategoria === OTRA ? subcategoriaOtra.trim() : subcategoria

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !categoriaFinal || !isin.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/fund-monitor/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria: categoriaFinal,
          subcategoria: subcategoriaFinal || null,
          isin: isin.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo agregar el fondo')
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
      >
        <h2 className="text-sm font-bold text-gray-900 mb-4">Agregar fondo</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Nombre del fondo</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Categoría general</label>
            <select
              value={categoria}
              onChange={e => { setCategoria(e.target.value); setSubcategoria('') }}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              {categoriasDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {categoria === OTRA && (
              <input
                value={categoriaOtra}
                onChange={e => setCategoriaOtra(e.target.value)}
                placeholder="Nombre de la categoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Subcategoría (opcional)</label>
            <select
              value={subcategoria}
              onChange={e => setSubcategoria(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              <option value="">(sin subcategoría)</option>
              {subOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {subcategoria === OTRA && (
              <input
                value={subcategoriaOtra}
                onChange={e => setSubcategoriaOtra(e.target.value)}
                placeholder="Nombre de la subcategoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">ISIN</label>
            <input
              value={isin}
              onChange={e => setIsin(e.target.value.toUpperCase())}
              placeholder="Ej: LU0154237225"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 font-mono"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !nombre.trim() || !categoriaFinal || !isin.trim()}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#1B3A2B' }}
          >
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}
