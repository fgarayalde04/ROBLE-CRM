'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ScoringFile = {
  id: string
  name: string
  client_folder: string | null
  client_id: string | null
  drive_id: string
  item_id: string
  web_url: string | null
  file_size: number | null
  last_modified: string | null
}

type Review = {
  id: string
  client_id: string | null
  client_name: string | null
  client_profile: string
  file_name: string
  portfolio_score: number | null
  portfolio_profile: string | null
  classified_weight: number | null
  pending_weight: number | null
  created_at: string
  crm_users?: { name: string } | null
}

const PROFILE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  conservador: { label: 'Conservador', color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
  moderado:    { label: 'Moderado',    color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  agresivo:    { label: 'Agresivo',    color: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
}

const CLIENT_PROFILES = ['conservador', 'moderado', 'agresivo']

function ScoreBadge({ score, profile }: { score: number | null; profile: string | null }) {
  if (score == null || !profile) return <span className="text-xs text-gray-400">—</span>
  const p = PROFILE_LABELS[profile] ?? PROFILE_LABELS.moderado
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${p.bg} ${p.color}`}>
      <span className="font-bold">{score.toFixed(1)}</span>
      <span>/10</span>
      <span className="text-[10px] font-normal opacity-75">· {p.label}</span>
    </span>
  )
}

function AlignedBadge({ reviewProfile, clientProfile }: { reviewProfile: string | null; clientProfile: string }) {
  if (!reviewProfile) return null
  const aligned = reviewProfile === clientProfile
  if (aligned) {
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">✓ Alineado</span>
  }
  return <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">⚠ Desajuste</span>
}

export default function SuitabilityClient() {
  const router = useRouter()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/suitability/reviews')
      if (res.ok) setReviews(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este análisis?')) return
    setDeleting(id)
    try {
      await fetch('/api/suitability/reviews', { method: 'DELETE', body: JSON.stringify({ id }) })
      setReviews(r => r.filter(x => x.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Suitability / Risk Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">Análisis de riesgo de carteras de clientes</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Subir cartera
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando análisis…</div>
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">No hay análisis todavía</p>
            <p className="text-xs text-gray-400 mt-1">Subí una cartera en Excel o CSV para comenzar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Perfil cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Score cartera</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ajuste</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Clasificado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Archivo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Analista</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.client_name || <span className="text-gray-400 font-normal italic">Sin nombre</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.client_profile ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PROFILE_LABELS[r.client_profile]?.bg ?? ''} ${PROFILE_LABELS[r.client_profile]?.color ?? ''}`}>
                        {PROFILE_LABELS[r.client_profile]?.label ?? r.client_profile}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={r.portfolio_score} profile={r.portfolio_profile} />
                  </td>
                  <td className="px-4 py-3">
                    <AlignedBadge reviewProfile={r.portfolio_profile} clientProfile={r.client_profile} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.classified_weight != null ? (
                      <span className="text-xs">
                        <span className={r.classified_weight >= 80 ? 'text-emerald-600 font-medium' : r.classified_weight >= 50 ? 'text-amber-600 font-medium' : 'text-red-500 font-medium'}>
                          {r.classified_weight.toFixed(1)}%
                        </span>
                        {r.pending_weight != null && r.pending_weight > 0 && (
                          <span className="text-gray-400 ml-1">({r.pending_weight.toFixed(1)}% pendiente)</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 font-mono truncate max-w-[140px] block">{r.file_name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {(r.crm_users as any)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/suitability/${r.id}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Ver →
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {deleting === r.id ? '…' : '✕'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false); loadReviews() }}
        />
      )}
    </div>
  )
}

// ─── Upload Modal (tabbed: subir archivo | desde OneDrive) ────────────────────

type FileStatus = 'queued' | 'processing' | 'done' | 'error'
type FileEntry = { file: File; status: FileStatus; error?: string; reviewId?: string }
type OdEntry  = { sf: ScoringFile; status: FileStatus; error?: string; reviewId?: string }

function UploadModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'upload' | 'onedrive'>('onedrive')
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Title row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h2 className="text-base font-semibold text-gray-900">Nueva análisis de cartera</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab header */}
        <div className="flex mt-4 border-b border-gray-100">
          <button
            onClick={() => setTab('onedrive')}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'onedrive' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/40' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
              </svg>
              Desde OneDrive
            </span>
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'upload' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/40' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Subir archivo
            </span>
          </button>
        </div>

        {tab === 'onedrive'
          ? <OneDriveTab onClose={onClose} />
          : <UploadTab    onClose={onClose} />
        }
      </div>
    </div>
  )
}

// ─── OneDrive tab ─────────────────────────────────────────────────────────────

function OneDriveTab({ onClose }: { onClose: () => void }) {
  const [search, setSearch]             = useState('')
  const [scoringFiles, setScoringFiles] = useState<ScoringFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [clientProfile, setClientProfile] = useState('moderado')
  const [notes, setNotes]               = useState('')
  const [processing, setProcessing]     = useState(false)
  const [entries, setEntries]           = useState<OdEntry[]>([])
  const [done, setDone]                 = useState(false)
  const [noSyncMsg, setNoSyncMsg]       = useState(false)

  const load = useCallback(async (q = '') => {
    setLoadingFiles(true)
    const url = q ? `/api/suitability/scoring-files?q=${encodeURIComponent(q)}` : '/api/suitability/scoring-files'
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setScoringFiles(data)
      if (!data.length && !q) setNoSyncMsg(true)
    }
    setLoadingFiles(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () => {
    if (selected.size === scoringFiles.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(scoringFiles.map(f => f.id)))
    }
  }

  const handleAnalyze = async () => {
    if (!selected.size) return
    setProcessing(true)
    const ids = Array.from(selected)
    const initialEntries: OdEntry[] = scoringFiles
      .filter(sf => selected.has(sf.id))
      .map(sf => ({ sf, status: 'processing' }))
    setEntries(initialEntries)

    try {
      const res = await fetch('/api/suitability/analyze-from-onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoring_file_ids: ids, client_profile: clientProfile, notes }),
      })
      const data = await res.json()

      if (res.ok && data.results) {
        setEntries(data.results.map((r: any) => {
          const sf = scoringFiles.find(f => initialEntries.find(e => e.sf.name === r.file_name && e.sf.id))
          return {
            sf: scoringFiles.find(f => f.name === r.file_name) ?? initialEntries[0].sf,
            status: r.error ? 'error' : 'done',
            error: r.error,
            reviewId: r.review_id,
          }
        }))
      } else {
        setEntries(prev => prev.map(e => ({ ...e, status: 'error', error: data.error ?? 'Error desconocido' })))
      }
    } catch (e: any) {
      setEntries(prev => prev.map(e => ({ ...e, status: 'error', error: e.message })))
    }

    setProcessing(false)
    setDone(true)
  }

  if (done) {
    const ok  = entries.filter(e => e.status === 'done').length
    const err = entries.filter(e => e.status === 'error').length
    return (
      <div className="p-6 space-y-4">
        <div className={`rounded-xl p-4 border ${err === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-sm font-semibold">
            {err === 0 ? `✓ ${ok} cartera${ok !== 1 ? 's' : ''} analizada${ok !== 1 ? 's' : ''}` : `${ok} listas · ${err} con error`}
          </p>
        </div>
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span>{e.status === 'done' ? '✓' : '✕'}</span>
              <span className="flex-1 truncate font-mono text-gray-600">{e.sf.name}</span>
              {e.status === 'done' && e.reviewId && (
                <Link href={`/suitability/${e.reviewId}`} className="text-blue-600 hover:text-blue-800 font-medium flex-shrink-0">Ver →</Link>
              )}
              {e.status === 'error' && <span className="text-red-400 truncate max-w-[120px]">{e.error}</span>}
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Ver resultados
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o cliente…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* File list */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {loadingFiles ? (
          <div className="py-8 text-center text-xs text-gray-400">Cargando archivos…</div>
        ) : noSyncMsg && !scoringFiles.length ? (
          <div className="py-8 text-center space-y-1">
            <p className="text-sm text-gray-500 font-medium">No hay archivos sincronizados</p>
            <p className="text-xs text-gray-400">Configurá la carpeta Scoring en OneDrive y ejecutá la sincronización desde Sincronización → Scoring</p>
          </div>
        ) : scoringFiles.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">Sin resultados</div>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {/* Select all */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50 sticky top-0">
              <input
                type="checkbox"
                checked={selected.size === scoringFiles.length && scoringFiles.length > 0}
                onChange={toggleAll}
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-xs text-gray-500">
                {selected.size > 0 ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}` : 'Seleccionar todos'}
              </span>
            </div>
            {scoringFiles.map(sf => (
              <label
                key={sf.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${selected.has(sf.id) ? 'bg-blue-50/40' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(sf.id)}
                  onChange={() => toggle(sf.id)}
                  className="rounded border-gray-300 text-blue-600 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{sf.name}</p>
                  {sf.client_folder && (
                    <p className="text-xs text-gray-400 truncate">{sf.client_folder}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sf.file_size != null && (
                    <span className="text-[10px] text-gray-400">{(sf.file_size / 1024).toFixed(0)} KB</span>
                  )}
                  {sf.last_modified && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(sf.last_modified).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}
                  {sf.web_url && (
                    <a
                      href={sf.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-gray-300 hover:text-blue-500 transition-colors"
                      title="Abrir en OneDrive"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Profile */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Perfil declarado</label>
        <div className="grid grid-cols-3 gap-2">
          {CLIENT_PROFILES.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setClientProfile(p)}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${clientProfile === p ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
            >
              {PROFILE_LABELS[p]?.label ?? p}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        placeholder="Notas del asesor (opcional)…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
      />

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button
          onClick={handleAnalyze}
          disabled={processing || selected.size === 0}
          className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {processing
            ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analizando…</span>
            : `Analizar ${selected.size > 0 ? selected.size : ''} seleccionado${selected.size !== 1 ? 's' : ''}`
          }
        </button>
      </div>
    </div>
  )
}

// ─── Upload tab (manual) ──────────────────────────────────────────────────────

function UploadTab({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const [files, setFiles]                 = useState<FileEntry[]>([])
  const [clientProfile, setClientProfile] = useState('moderado')
  const [notes, setNotes]                 = useState('')
  const [processing, setProcessing]       = useState(false)
  const [done, setDone]                   = useState(false)

  // Client search
  const [clientSearch, setClientSearch]       = useState('')
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; first_name: string; last_name: string; client_number: string }[]>([])
  const [selectedClientId, setSelectedClientId]   = useState<string | null>(null)
  const [clientName, setClientName]               = useState('')
  const [showSuggestions, setShowSuggestions]     = useState(false)

  useEffect(() => {
    if (clientSearch.length < 2) { setClientSuggestions([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clients?q=${encodeURIComponent(clientSearch)}`)
      if (res.ok) setClientSuggestions(await res.json())
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch])

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const accepted = Array.from(incoming).filter(f =>
      /\.(xlsx|xls|csv|txt)$/i.test(f.name)
    )
    setFiles(prev => {
      const existing = new Set(prev.map(e => e.file.name))
      const fresh = accepted.filter(f => !existing.has(f.name))
      return [...prev, ...fresh.map(f => ({ file: f, status: 'queued' as FileStatus }))]
    })
  }

  // Drag & drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); addFiles(e.dataTransfer.files) }

  const removeFile = (name: string) => setFiles(prev => prev.filter(e => e.file.name !== name))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files.length) return
    setProcessing(true)

    // Process sequentially to respect OpenFIGI rate limits
    for (let i = 0; i < files.length; i++) {
      setFiles(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'processing' } : e))

      try {
        const form = new FormData()
        form.append('file', files[i].file)
        form.append('client_name', clientName || clientSearch || files[i].file.name.replace(/\.[^.]+$/, ''))
        form.append('client_profile', clientProfile)
        if (selectedClientId) form.append('client_id', selectedClientId)
        if (notes) form.append('notes', notes)

        const res  = await fetch('/api/suitability/upload', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al procesar')

        setFiles(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'done', reviewId: data.review.id } : e))
      } catch (err: any) {
        setFiles(prev => prev.map((e, idx) => idx === i ? { ...e, status: 'error', error: err.message } : e))
      }
    }

    setProcessing(false)
    setDone(true)
  }

  const completedCount = files.filter(f => f.status === 'done').length
  const errorCount     = files.filter(f => f.status === 'error').length

  const STATUS_UI: Record<FileStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    queued:     { label: 'En cola',    cls: 'bg-gray-100 text-gray-500',    icon: <span className="w-3 h-3 rounded-full border-2 border-gray-300 inline-block" /> },
    processing: { label: 'Procesando', cls: 'bg-blue-50 text-blue-600',     icon: <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> },
    done:       { label: 'Listo',      cls: 'bg-emerald-50 text-emerald-600', icon: <span className="text-emerald-500">✓</span> },
    error:      { label: 'Error',      cls: 'bg-red-50 text-red-500',        icon: <span className="text-red-400">✕</span> },
  }

  return (
    <div className="p-6 space-y-4">
        {done ? (
          /* ── Done state ─────────────────────────── */
          <div className="space-y-4">
            <div className={`rounded-xl p-4 border ${errorCount === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-sm font-semibold text-gray-800">
                {errorCount === 0
                  ? `✓ ${completedCount} cartera${completedCount !== 1 ? 's' : ''} procesada${completedCount !== 1 ? 's' : ''} correctamente`
                  : `${completedCount} listas · ${errorCount} con error`}
              </p>
            </div>

            {/* File list */}
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {files.map(entry => {
                const ui = STATUS_UI[entry.status]
                return (
                  <li key={entry.file.name} className="flex items-center gap-2.5 text-sm">
                    <span className="flex-shrink-0">{ui.icon}</span>
                    <span className="flex-1 truncate text-gray-700 font-mono text-xs">{entry.file.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ui.cls}`}>{ui.label}</span>
                    {entry.status === 'done' && entry.reviewId && (
                      <Link href={`/suitability/${entry.reviewId}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex-shrink-0">Ver →</Link>
                    )}
                    {entry.status === 'error' && entry.error && (
                      <span className="text-xs text-red-400 truncate max-w-[120px]" title={entry.error}>{entry.error}</span>
                    )}
                  </li>
                )
              })}
            </ul>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Ver resultados
            </button>
          </div>
        ) : (
          /* ── Form state ─────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Drop zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Archivos <span className="text-gray-400 font-normal">(xlsx, xls, csv)</span>
              </label>
              <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">Arrastrá archivos o hacé click</p>
                <p className="text-xs text-gray-400 mt-0.5">Podés seleccionar varios a la vez</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>

            {/* File queue */}
            {files.length > 0 && (
              <ul className="space-y-1.5 max-h-36 overflow-y-auto border border-gray-100 rounded-xl p-3 bg-gray-50">
                {files.map(entry => (
                  <li key={entry.file.name} className="flex items-center gap-2 text-xs">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1 truncate font-mono text-gray-700">{entry.file.name}</span>
                    <span className="text-gray-400">{(entry.file.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(entry.file.name)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">✕</button>
                  </li>
                ))}
              </ul>
            )}

            {/* Client search */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Cliente <span className="text-gray-400 font-normal">(opcional — se aplica a todos)</span>
              </label>
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setShowSuggestions(true); setSelectedClientId(null); setClientName('') }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                placeholder="Buscar por nombre o N° de cliente…"
              />
              {showSuggestions && clientSuggestions.length > 0 && (
                <ul className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {clientSuggestions.map(c => (
                    <li
                      key={c.id}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-sm"
                      onMouseDown={() => {
                        setSelectedClientId(c.id)
                        setClientName(`${c.first_name} ${c.last_name}`)
                        setClientSearch(`${c.first_name} ${c.last_name}`)
                        setShowSuggestions(false)
                      }}
                    >
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      <span className="text-gray-400 text-xs">#{c.client_number}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Profile */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Perfil declarado</label>
              <div className="grid grid-cols-3 gap-2">
                {CLIENT_PROFILES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setClientProfile(p)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      clientProfile === p
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {PROFILE_LABELS[p]?.label ?? p}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                placeholder="Observaciones del asesor…"
              />
            </div>

            {/* Progress bar while uploading */}
            {processing && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Procesando archivos…</span>
                  <span>{files.filter(f => f.status === 'done' || f.status === 'error').length} / {files.length}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${(files.filter(f => f.status === 'done' || f.status === 'error').length / files.length) * 100}%` }}
                  />
                </div>
                <ul className="space-y-1 max-h-28 overflow-y-auto">
                  {files.map(entry => {
                    const ui = STATUS_UI[entry.status]
                    return (
                      <li key={entry.file.name} className="flex items-center gap-2 text-xs">
                        <span className="flex-shrink-0 w-4 flex justify-center">{ui.icon}</span>
                        <span className="flex-1 truncate text-gray-600 font-mono">{entry.file.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${ui.cls}`}>{ui.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="flex-1 py-2.5 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processing || files.length === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {processing ? 'Procesando…' : `Analizar ${files.length > 0 ? files.length : ''} cartera${files.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        )}
    </div>
  )
}
