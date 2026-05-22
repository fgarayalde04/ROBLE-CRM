'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Contact { name: string; email: string }

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}

// Global cache so we only fetch once per page load
let cachedContacts: Contact[] | null = null
let fetchPromise: Promise<Contact[]> | null = null

async function loadContacts(): Promise<Contact[]> {
  if (cachedContacts) return cachedContacts
  if (fetchPromise) return fetchPromise

  fetchPromise = fetch('/api/gmail/contacts')
    .then((r) => r.json())
    .then((d) => {
      cachedContacts = d.contacts ?? []
      return cachedContacts!
    })
    .catch(() => {
      cachedContacts = []
      return []
    })

  return fetchPromise
}

export default function EmailAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const [open, setOpen]           = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  useEffect(() => {
    loadContacts().then(setContacts)
  }, [])

  // The "current token" is the last comma-separated segment being typed
  function currentToken(v: string) {
    const parts = v.split(',')
    return parts[parts.length - 1].trim()
  }

  function updateSuggestions(v: string) {
    const token = currentToken(v)
    if (token.length < 1) { setSuggestions([]); setOpen(false); return }

    const lower = token.toLowerCase()
    const matches = contacts
      .filter((c) =>
        c.email.toLowerCase().includes(lower) ||
        c.name.toLowerCase().includes(lower)
      )
      .slice(0, 8)

    setSuggestions(matches)
    setOpen(matches.length > 0)
    setActiveIdx(-1)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    updateSuggestions(v)
  }

  function pickSuggestion(contact: Contact) {
    // Replace the last token with the chosen email
    const parts = value.split(',').map((p) => p.trim()).filter(Boolean)
    parts[parts.length === 0 ? 0 : parts.length - 1] = contact.email
    const newVal = parts.join(', ') + ', '
    onChange(newVal)
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if ((e.key === 'Enter' || e.key === 'Tab') && activeIdx >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => updateSuggestions(value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-[#E2E8F0] rounded-lg shadow-lg w-full max-w-sm overflow-hidden"
        >
          {suggestions.map((c, i) => (
            <li
              key={c.email}
              onMouseDown={() => pickSuggestion(c)}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                i === activeIdx ? 'bg-[#EFF3F8]' : 'hover:bg-[#F4F6F8]'
              }`}
            >
              {/* Avatar */}
              <div className="shrink-0 w-7 h-7 rounded-full bg-[#E2E8F0] flex items-center justify-center text-[11px] font-semibold text-[#2D3F52]">
                {(c.name || c.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                {c.name && (
                  <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                )}
                <p className="text-[11px] text-gray-500 truncate">{c.email}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
