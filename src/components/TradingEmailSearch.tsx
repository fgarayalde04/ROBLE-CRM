'use client'

import { useState, useEffect, useRef } from 'react'

interface Contact {
  name: string
  email: string
}

interface Props {
  value: string
  onChange: (email: string) => void
  placeholder?: string
  className?: string
}

export default function TradingEmailSearch({ value, onChange, placeholder, className }: Props) {
  const [contacts, setContacts]     = useState<Contact[]>([])
  const [filtered, setFiltered]     = useState<Contact[]>([])
  const [open, setOpen]             = useState(false)
  const [highlight, setHighlight]   = useState(-1)
  const [loadState, setLoadState]   = useState<'idle' | 'loading' | 'done'>('idle')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // Load contacts once on first focus
  async function loadContacts() {
    if (loadState !== 'idle') return
    setLoadState('loading')
    try {
      const res  = await fetch('/api/gmail/contacts')
      const data = await res.json()
      setContacts(data.contacts ?? [])
    } catch { /* silent */ }
    finally { setLoadState('done') }
  }

  // Filter whenever value or contacts change
  useEffect(() => {
    const q = value.trim().toLowerCase()
    if (!q || q.length < 1) { setFiltered([]); setOpen(false); return }
    const results = contacts
      .filter((c) =>
        c.email.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      )
      .slice(0, 8)
    setFiltered(results)
    setOpen(results.length > 0)
    setHighlight(-1)
  }, [value, contacts])

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

  function handleSelect(c: Contact) {
    onChange(c.email)
    setOpen(false)
    setFiltered([])
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); handleSelect(filtered[highlight]) }
    if (e.key === 'Escape') setOpen(false)
  }

  const inputCls = className ?? 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'

  // Highlight matching part in text
  function highlight_text(text: string, q: string) {
    if (!q) return <span>{text}</span>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-100 text-yellow-800 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="email"
          className={inputCls}
          placeholder={placeholder ?? 'destinatario@email.com'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { loadContacts(); if (filtered.length > 0) setOpen(true) }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {loadState === 'loading' && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        )}
        {loadState === 'done' && value && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <ul>
            {filtered.map((c, idx) => {
              const q = value.trim()
              return (
                <li key={c.email}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
                    className={[
                      'w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors',
                      idx === highlight ? 'bg-blue-50' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-full bg-[#2D3F52]/10 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-[#2D3F52]">
                        {(c.name || c.email)[0].toUpperCase()}
                      </span>
                    </div>
                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      {c.name ? (
                        <>
                          <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                            {highlight_text(c.name, q)}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate leading-tight">
                            {highlight_text(c.email, q)}
                          </p>
                        </>
                      ) : (
                        <p className="text-[13px] font-semibold text-gray-800 truncate">
                          {highlight_text(c.email, q)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50/80">
            <p className="text-[10px] text-gray-400">
              Contactos de trading@roblecapital.net · {contacts.length} en total
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
