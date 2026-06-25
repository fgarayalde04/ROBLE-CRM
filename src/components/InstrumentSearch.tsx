'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Instrument } from '@/app/api/instruments/route'

interface Props {
  tipo: 'fondo' | 'bono'
  value: string                                       // nombre visible en el input
  onSelect: (instrument: Instrument) => void          // cuando elige uno
  onChange: (value: string) => void                   // cuando escribe libremente
  placeholder?: string
  className?: string
}

const TIPO_COLOR = {
  fondo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bono:  'bg-amber-50   text-amber-700   border-amber-200',
  accion:'bg-blue-50    text-blue-700    border-blue-200',
}

export default function InstrumentSearch({ tipo, value, onSelect, onChange, placeholder, className }: Props) {
  const [results, setResults]   = useState<Instrument[]>([])
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, tipo, limit: '12' })
      const res  = await fetch(`/api/instruments?${params}`)
      const data = await res.json()
      setResults(data.instruments ?? [])
      setOpen(true)
      setHighlight(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [tipo])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 200)
  }

  function handleSelect(inst: Instrument) {
    onSelect(inst)
    setOpen(false)
    setResults([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); handleSelect(results[highlight]) }
    if (e.key === 'Escape') { setOpen(false) }
  }

  // Close on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  const inputCls = className ?? 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          className={inputCls}
          placeholder={placeholder ?? `Buscar por nombre, ISIN o CUSIP…`}
          value={value}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        )}
        {!loading && value && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); setResults([]); setOpen(false) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <ul>
            {results.map((inst, idx) => (
              <li key={inst.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(inst) }}
                  className={[
                    'w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors',
                    idx === highlight ? 'bg-blue-50' : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  {/* Tipo badge */}
                  <span className={`mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${TIPO_COLOR[inst.tipo_activo] ?? TIPO_COLOR.fondo}`}>
                    {inst.tipo_activo.toUpperCase()}
                  </span>

                  {/* Name + codes */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2D3F52] leading-snug whitespace-normal break-words">{inst.nombre}</p>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {inst.emisor && (
                        <span className="text-[10px] text-gray-400">{inst.emisor}</span>
                      )}
                      {inst.isin && (
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1 rounded">
                          {inst.isin}
                        </span>
                      )}
                      {inst.cusip && (
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1 rounded">
                          {inst.cusip}
                        </span>
                      )}
                      {inst.moneda && (
                        <span className="text-[10px] text-gray-400">{inst.moneda}</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {results.length === 0 && !loading && (
            <p className="px-3 py-3 text-sm text-gray-400 italic">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  )
}
