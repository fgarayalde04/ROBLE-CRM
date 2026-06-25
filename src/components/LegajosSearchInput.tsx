'use client'

import { useState, useRef, useEffect } from 'react'

interface LegajoResult {
  id: string
  customer_number: string | null
  folder_name: string
  display_name: string
  type: 'local' | 'internacional'
  fa: string | null
  status: string
  authorized_email: string | null
}

interface Props {
  value: string
  onChange: (id: string, displayName: string, customerNumber: string, fa?: string, email?: string | null) => void
  placeholder?: string
  className?: string
}

const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'

export default function LegajosSearchInput({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LegajoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Search legajos as user types
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/legajos/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(Array.isArray(data.results) ? data.results : [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 280)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleSelect(r: LegajoResult) {
    setSelectedName(r.display_name)
    setQuery('')
    setOpen(false)
    onChange(r.id, r.display_name, r.customer_number ?? '', r.fa ?? undefined, r.authorized_email ?? null)
  }

  function handleClear() {
    setSelectedName('')
    setQuery('')
    setOpen(false)
    onChange('', '', '', undefined, null)
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Selected state */}
      {selectedName ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white min-h-[38px]">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="flex-1 text-sm text-[#2D3F52] font-medium truncate">{selectedName}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
            aria-label="Cambiar cliente"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* Search input */
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            className={inputCls + ' pl-9'}
            placeholder={placeholder ?? 'Buscar en Legajos…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
          />
          {loading && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Legajos Banco Central</span>
          </div>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={() => handleSelect(r)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2D3F52] truncate">{r.display_name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {r.customer_number && (
                    <span className="text-[11px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                      #{r.customer_number}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    r.type === 'local' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {r.type === 'local' ? 'Local' : 'Internacional'}
                  </span>
                  {r.fa && (
                    <span className="text-[11px] text-gray-400">FA: {r.fa}</span>
                  )}
                  {r.authorized_email && (
                    <span className="text-[11px] text-emerald-600">✓ {r.authorized_email}</span>
                  )}
                  {!r.authorized_email && (
                    <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">Sin email</span>
                  )}
                  {r.status === 'cerrada' && (
                    <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Cerrada</span>
                  )}
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3">
          <p className="text-sm text-gray-400">Sin resultados en Legajos para <strong>"{query}"</strong></p>
        </div>
      )}
    </div>
  )
}
