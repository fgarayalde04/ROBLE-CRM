'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Proposal {
  id: string
  advisor_id: string | null
  client_name: string | null
  advisor_name: string | null
  total_amount: number
  currency: string
  title: string | null
  status: string
  shared_with_all: boolean
  created_at: string
  updated_at: string
  sent_at: string | null
}

interface ProposalStats {
  funds_pct:    number
  bonds_pct:    number
  equities_pct: number
  avg_yield:    number | null
}

interface Client {
  id: string
  first_name: string
  last_name: string
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Borrador',  color: 'text-gray-600',    bg: 'bg-gray-100'   },
  review:   { label: 'Revisión',  color: 'text-amber-700',   bg: 'bg-amber-50'   },
  sent:     { label: 'Enviada',   color: 'text-blue-700',    bg: 'bg-blue-50'    },
  accepted: { label: 'Aceptada',  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  archived: { label: 'Archivada', color: 'text-gray-400',    bg: 'bg-gray-50'    },
}

function fmtMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Inline editable text cell ──────────────────────────────────────────────────

function InlineEdit({
  value, placeholder, onSave, className = '',
}: {
  value: string | null
  placeholder: string
  onSave: (v: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLocal(value ?? '')
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    setEditing(false)
    if (local !== (value ?? '')) onSave(local)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        onClick={e => e.stopPropagation()}
        className={`border border-[#1B2E3C]/30 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B2E3C]/30 bg-white ${className}`}
        style={{ minWidth: 100 }}
      />
    )
  }

  return (
    <span
      onClick={start}
      title="Click para editar"
      className={`cursor-text hover:bg-gray-100 px-1 py-0.5 rounded transition-colors inline-block ${
        value ? '' : 'text-gray-300 italic'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}

// ── Allocation mini-bar ────────────────────────────────────────────────────────

function AllocBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  if (pct === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      <span className="text-[10px] font-bold text-[#2D3F52] tabular-nums">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Create Modal ───────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: string) => void }) {
  const [clients, setClients]   = useState<Client[]>([])
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [amount, setAmount]     = useState('')
  const [currency, setCurrency] = useState('USD')
  const [title, setTitle]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')

  useEffect(() => {
    const q = Math.ceil((new Date().getMonth() + 1) / 3)
    const y = new Date().getFullYear()
    setTitle(selected ? `Propuesta Q${q} ${y} — ${selected.first_name} ${selected.last_name}` : `Propuesta Q${q} ${y}`)
  }, [selected])

  const searchClients = useCallback(async (q: string) => {
    if (q.length < 1) { setClients([]); return }
    const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}`)
    if (res.ok) {
      const data = await res.json()
      setClients(Array.isArray(data) ? data : data.clients ?? [])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchClients(search), 200)
    return () => clearTimeout(t)
  }, [search, searchClients])

  const handleCreate = async () => {
    if (!amount || parseFloat(amount.replace(/,/g, '')) <= 0) { setErr('Ingresá un monto válido'); return }
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:    selected?.id    ?? null,
          client_name:  selected ? `${selected.first_name} ${selected.last_name}` : null,
          total_amount: parseFloat(amount.replace(/,/g, '')),
          currency, title,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Error'); return }
      onCreate(data.id)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Nueva propuesta</h2>
            <p className="text-xs text-gray-400 mt-0.5">Completá los datos básicos para empezar</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cliente</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={selected ? `${selected.first_name} ${selected.last_name}` : search}
                onChange={e => { setSearch(e.target.value); setSelected(null); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
              />
              {selected && (
                <button onClick={() => { setSelected(null); setSearch('') }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">×</button>
              )}
              {showDrop && !selected && clients.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {clients.map(c => (
                    <button key={c.id}
                      onClick={() => { setSelected(c); setShowDrop(false); setSearch('') }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                      {c.first_name} {c.last_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!selected && <p className="text-[10px] text-gray-400 mt-1">Opcional — podés asignarlo después</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Título</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto total *</label>
            <div className="flex gap-2">
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none w-24">
                <option>USD</option><option>EUR</option><option>UYU</option>
              </select>
              <input type="text" placeholder="500,000" value={amount} onChange={e => setAmount(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none font-mono" />
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button onClick={handleCreate} disabled={loading}
            className="px-5 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors disabled:opacity-50 flex items-center gap-2">
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {loading ? 'Creando...' : 'Crear y editar →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main list ──────────────────────────────────────────────────────────────────

export default function ProposalListClient({
  initialProposals,
  initialStats,
  currentUserId,
}: {
  initialProposals: Proposal[]
  initialStats:     Record<string, ProposalStats>
  currentUserId:    string
}) {
  const router                      = useRouter()
  const [proposals, setProposals]   = useState<Proposal[]>(initialProposals)
  const [filter, setFilter]         = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sharingId, setSharingId]   = useState<string | null>(null)

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter)

  const patchProposal = useCallback(async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      setProposals(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
    }
  }, [])

  const toggleShare = async (p: Proposal) => {
    setSharingId(p.id)
    const newVal = !p.shared_with_all
    await patchProposal(p.id, { shared_with_all: newVal })
    setProposals(prev => prev.map(x => x.id === p.id ? { ...x, shared_with_all: newVal } : x))
    setSharingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta propuesta? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    await fetch(`/api/proposals/${id}`, { method: 'DELETE' })
    setProposals(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
  }

  const tabs = [
    { key: 'all',      label: 'Todas',     count: proposals.length },
    { key: 'draft',    label: 'Borrador',  count: proposals.filter(p => p.status === 'draft').length },
    { key: 'sent',     label: 'Enviadas',  count: proposals.filter(p => p.status === 'sent').length },
    { key: 'accepted', label: 'Aceptadas', count: proposals.filter(p => p.status === 'accepted').length },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs + New button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                filter === t.key ? 'border-[#16A34A] text-[#2D3F52]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
              {t.count > 0 && <span className="ml-1.5 text-[10px] font-normal text-gray-400">({t.count})</span>}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#1f2d3d] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva propuesta
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Sin propuestas</p>
          <p className="text-xs text-gray-400 mb-5">Creá tu primera propuesta de inversión profesional.</p>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors">
            Nueva propuesta
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Propuesta</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Cliente</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Monto</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Asesor</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Portafolio</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Fecha</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Visibilidad</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => {
                const st    = STATUS_LABELS[p.status] ?? STATUS_LABELS.draft
                const stats = initialStats[p.id]
                const hasAlloc = stats && (stats.funds_pct + stats.bonds_pct + stats.equities_pct) > 0

                return (
                  <tr key={p.id}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/propuestas/${p.id}`)}>

                    {/* Propuesta */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800">{p.title ?? 'Sin título'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{p.id.slice(0, 8)}…</p>
                    </td>

                    {/* Cliente — inline editable */}
                    <td className="px-4 py-3.5 hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                      <InlineEdit
                        value={p.client_name}
                        placeholder="Sin cliente"
                        onSave={v => patchProposal(p.id, { client_name: v || null })}
                        className="text-xs text-gray-600"
                      />
                    </td>

                    {/* Monto */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm font-semibold text-[#2D3F52] font-mono tabular-nums">
                        {fmtMoney(p.total_amount, p.currency)}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                        {st.label}
                      </span>
                    </td>

                    {/* Asesor — inline editable */}
                    <td className="px-4 py-3.5 hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <InlineEdit
                        value={p.advisor_name}
                        placeholder="Sin asesor"
                        onSave={v => patchProposal(p.id, { advisor_name: v || null })}
                        className="text-xs text-gray-500"
                      />
                    </td>

                    {/* Portafolio — asignación + yield */}
                    <td className="px-4 py-3.5 hidden xl:table-cell">
                      {hasAlloc ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <AllocBar label="F" pct={stats.funds_pct}    color="bg-blue-400" />
                            <AllocBar label="B" pct={stats.bonds_pct}    color="bg-amber-400" />
                            <AllocBar label="A" pct={stats.equities_pct} color="bg-emerald-400" />
                          </div>
                          {stats.avg_yield != null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400">Yield prom.</span>
                              <span className="text-[10px] font-bold text-[#2D3F52] tabular-nums">{stats.avg_yield.toFixed(2)}%</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">Sin activos</span>
                      )}
                    </td>

                    {/* Fecha */}
                    <td className="px-4 py-3.5 text-xs text-gray-400 hidden lg:table-cell">{fmtDate(p.created_at)}</td>

                    {/* Visibilidad */}
                    <td className="px-4 py-3.5 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                      {p.advisor_id === currentUserId ? (
                        <button
                          onClick={() => toggleShare(p)}
                          disabled={sharingId === p.id}
                          title={p.shared_with_all ? 'Visible para todos — click para hacer privada' : 'Solo vos — click para compartir'}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors border ${
                            p.shared_with_all
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                          } ${sharingId === p.id ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          {sharingId === p.id
                            ? <span className="w-2.5 h-2.5 border border-current/40 border-t-current rounded-full animate-spin" />
                            : p.shared_with_all
                              ? <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              : <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                          }
                          {p.shared_with_all ? 'Visible para todos' : 'Solo yo'}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          Compartida
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => router.push(`/propuestas/${p.id}`)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Editar
                        </button>
                        {p.advisor_id === currentUserId && (
                          <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id}
                            className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">
                            {deletingId === p.id ? '...' : '×'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={id => { setShowCreate(false); router.push(`/propuestas/${id}`) }} />}
    </div>
  )
}
