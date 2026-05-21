'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotlightClient {
  id: string
  first_name: string
  last_name: string
  client_number: string
  status: string
}

interface SpotlightTask {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
}

interface SpotlightOpening {
  id: string
  folder_name: string
  status: string
  advisor: string | null
}

interface SpotlightResource {
  id: string
  name: string
  category: string | null
  file_url: string | null
}

interface SpotlightResults {
  clients: SpotlightClient[]
  tasks: SpotlightTask[]
  openings: SpotlightOpening[]
  resources: SpotlightResource[]
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PersonIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Quick access links ───────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Clientes', href: '/clients', icon: <PersonIcon /> },
  { label: 'Tareas', href: '/tasks', icon: <CheckIcon /> },
  { label: 'Aperturas', href: '/openings', icon: <BuildingIcon /> },
  { label: 'Recursos', href: '/recursos', icon: <DocumentIcon /> },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function SpotlightSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotlightResults>({ clients: [], tasks: [], openings: [], resources: [] })
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build flat list of navigable items for keyboard nav
  const flatItems: { href: string; label: string }[] = [
    ...results.clients.map((c) => ({ href: `/clients/${c.id}`, label: `${c.first_name} ${c.last_name}` })),
    ...results.tasks.map((t) => ({ href: '/tasks', label: t.title })),
    ...results.openings.map((o) => ({ href: `/openings/${o.id}`, label: o.folder_name })),
    ...results.resources.map((r) => ({ href: '/recursos', label: r.name })),
  ]

  const closeModal = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults({ clients: [], tasks: [], openings: [], resources: [] })
    setSelectedIndex(0)
  }, [])

  const navigate = useCallback(
    (href: string) => {
      closeModal()
      router.push(href)
    },
    [closeModal, router]
  )

  // Global keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeModal])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Keyboard navigation within modal
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (flatItems[selectedIndex]) {
          navigate(flatItems[selectedIndex].href)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, flatItems, selectedIndex, navigate])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setResults({ clients: [], tasks: [], openings: [], resources: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotlight?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
        setSelectedIndex(0)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  if (!open) return null

  const hasResults =
    results.clients.length > 0 ||
    results.tasks.length > 0 ||
    results.openings.length > 0 ||
    results.resources.length > 0

  // Track absolute index for highlight
  let runningIndex = 0

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <span className="text-gray-400 flex-shrink-0">
            {loading ? (
              <svg className="w-5 h-5 animate-spin text-[#16A34A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <SearchIcon />
            )}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, tareas, aperturas..."
            className="flex-1 text-base text-gray-900 outline-none placeholder-gray-400 bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-300 hover:text-gray-500 text-xs px-2 py-0.5 rounded border border-gray-200"
            >
              Esc
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            /* Quick access */
            <div className="p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acceso rapido</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_LINKS.map((link) => (
                  <button
                    key={link.href}
                    onClick={() => navigate(link.href)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors text-sm text-gray-700 text-left"
                  >
                    <span className="text-[#2D3F52]">{link.icon}</span>
                    <span>→ {link.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : !hasResults && !loading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Sin resultados para <span className="font-medium text-gray-600">&quot;{query}&quot;</span>
            </div>
          ) : (
            <div className="py-2">
              {/* Clients */}
              {results.clients.length > 0 && (
                <ResultSection title="Clientes">
                  {results.clients.map((c) => {
                    const idx = runningIndex++
                    return (
                      <ResultRow
                        key={c.id}
                        icon={<PersonIcon />}
                        iconColor="text-blue-600 bg-blue-50"
                        title={`${c.first_name} ${c.last_name}`}
                        subtitle={`${c.client_number} · ${c.status}`}
                        selected={selectedIndex === idx}
                        onClick={() => navigate(`/clients/${c.id}`)}
                      />
                    )
                  })}
                </ResultSection>
              )}

              {/* Tasks */}
              {results.tasks.length > 0 && (
                <ResultSection title="Tareas">
                  {results.tasks.map((t) => {
                    const idx = runningIndex++
                    return (
                      <ResultRow
                        key={t.id}
                        icon={<CheckIcon />}
                        iconColor="text-amber-600 bg-amber-50"
                        title={t.title}
                        subtitle={`${t.priority} · ${t.status}${t.due_date ? ` · ${t.due_date}` : ''}`}
                        selected={selectedIndex === idx}
                        onClick={() => navigate('/tasks')}
                      />
                    )
                  })}
                </ResultSection>
              )}

              {/* Openings */}
              {results.openings.length > 0 && (
                <ResultSection title="Aperturas">
                  {results.openings.map((o) => {
                    const idx = runningIndex++
                    return (
                      <ResultRow
                        key={o.id}
                        icon={<BuildingIcon />}
                        iconColor="text-purple-600 bg-purple-50"
                        title={o.folder_name}
                        subtitle={`${o.status}${o.advisor ? ` · ${o.advisor}` : ''}`}
                        selected={selectedIndex === idx}
                        onClick={() => navigate(`/openings/${o.id}`)}
                      />
                    )
                  })}
                </ResultSection>
              )}

              {/* Resources */}
              {results.resources.length > 0 && (
                <ResultSection title="Recursos">
                  {results.resources.map((r) => {
                    const idx = runningIndex++
                    return (
                      <ResultRow
                        key={r.id}
                        icon={<DocumentIcon />}
                        iconColor="text-rose-600 bg-rose-50"
                        title={r.name}
                        subtitle={r.category ?? 'Recurso'}
                        selected={selectedIndex === idx}
                        onClick={() => navigate('/recursos')}
                      />
                    )
                  })}
                </ResultSection>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
          <span><kbd className="font-sans">↑↓</kbd> navegar</span>
          <span><kbd className="font-sans">↵</kbd> abrir</span>
          <span><kbd className="font-sans">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function ResultRow({
  icon,
  iconColor,
  title,
  subtitle,
  selected,
  onClick,
}: {
  icon: React.ReactNode
  iconColor: string
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        selected ? 'bg-[#2D3F52]/5 border-l-2 border-[#16A34A]' : 'border-l-2 border-transparent hover:bg-gray-50'
      }`}
    >
      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-400 truncate">{subtitle}</p>
      </div>
    </button>
  )
}

// ─── Trigger pill ─────────────────────────────────────────────────────────────

export function SpotlightTrigger() {
  const handleClick = () => {
    // Dispatch the CMD+K shortcut programmatically by opening via custom event
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    )
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition-colors text-white/70 text-xs"
      title="Buscar (⌘K)"
    >
      <SearchIcon />
      <span className="hidden sm:inline">Buscar</span>
      <kbd className="text-[10px] opacity-60 font-sans">⌘K</kbd>
    </button>
  )
}
