'use client'

import { useState, useEffect, useRef } from 'react'

interface ClientOption {
  id: string
  first_name: string
  last_name: string
  client_number: string
  status: string
}

interface Props {
  value: string              // client_id seleccionado
  onChange: (id: string, name: string) => void
  placeholder?: string
  className?: string
}

export default function ClientSearchInput({ value, onChange, placeholder = 'Buscar cliente...', className = '' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Si hay un value inicial, cargar el nombre
  useEffect(() => {
    if (value && !selectedName) {
      fetch(`/api/clients/by-id?id=${value}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.first_name) {
            setSelectedName(`${d.first_name} ${d.last_name}`)
            setQuery(`${d.first_name} ${d.last_name}`)
          }
        })
        .catch(() => {})
    }
    if (!value) {
      setSelectedName('')
      setQuery('')
    }
  }, [value])

  // Buscar con debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!open) return

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        // Si hay un cliente seleccionado y el usuario cambió el texto, restaurar
        if (value && selectedName) {
          setQuery(selectedName)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [value, selectedName])

  function handleSelect(client: ClientOption) {
    const name = `${client.first_name} ${client.last_name}`
    setSelectedName(name)
    setQuery(name)
    setOpen(false)
    onChange(client.id, name)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedName('')
    setQuery('')
    setResults([])
    onChange('', '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedName('')
            onChange('', '')
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full text-sm border border-gray-200 rounded px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] bg-white text-gray-900 placeholder:text-gray-300"
        />

        {/* Ícono: X si hay seleccionado, lupa si no */}
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Quitar cliente"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
        >
          {loading && (
            <div className="px-3 py-2.5 text-xs text-gray-400">Buscando...</div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-gray-400">
              {query.length > 0 ? `Sin resultados para "${query}"` : 'Escribí para buscar un cliente'}
            </div>
          )}

          {!loading && results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-2.5 hover:bg-[#2D3F52]/5 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
            >
              <span className="text-sm font-medium text-gray-800">
                {c.first_name} {c.last_name}
              </span>
              <span className="text-[11px] text-gray-400 font-mono shrink-0">#{c.client_number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
