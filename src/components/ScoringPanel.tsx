'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoringPeriod {
  id: string
  period_year: number
  period_quarter: number
  status: string
  created_at: string
  updated_at: string
  notes: string | null
  total_reviews: number
  clients_aligned: number
  clients_misaligned: number
  pending_assets: number
}

interface PeriodReview {
  id: string
  client_id: string | null
  client_name: string | null
  client_number: string | null   // account number from clients table
  client_profile: string
  advisor: string | null
  portfolio_score: number | null
  portfolio_profile: string | null
  classified_weight: number | null
  pending_weight: number | null
  explanation: string | null
  file_name: string
  notes: string | null
  created_at: string
  crm_users?: { name: string } | null
}

interface ScoringFile {
  id: string
  name: string
  client_folder: string | null
  drive_id: string
  item_id: string
}

interface AnalysisResult {
  file_name:        string
  client_name:      string | null
  match_confidence: number | null
  match_type:       string | null
  detected_name:    string | null
  secondary_holder: string | null
  error?:           string
}

interface AssetEntry {
  id: string
  security_identifier: string
  identifier_type: string | null
  isin: string | null
  cusip: string | null
  symbol: string | null
  figi: string | null
  normalized_name: string | null
  security_description: string | null
  security_type: string | null
  market_sector: string | null
  asset_class: string | null
  category: string | null
  risk_score: number | null
  score_explanation: string | null
  source: string | null
  classification_status: string | null
  needs_review: boolean
  // seen-tracking
  times_seen: number | null
  first_seen_at: string | null
  last_seen_at: string | null
  last_client_seen: string | null
  // manual override
  manual_override: boolean
  manual_override_by: string | null
  manual_override_at: string | null
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const Q_LABELS: Record<number, string> = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' }
const Q_MONTHS: Record<number, string> = { 1: 'Ene–Mar', 2: 'Abr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dic' }

const PROFILE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  conservador: { bg: 'bg-blue-50',   text: 'text-blue-700',  border: 'border-blue-200'  },
  moderado:    { bg: 'bg-amber-50',  text: 'text-amber-700', border: 'border-amber-200' },
  agresivo:    { bg: 'bg-red-50',    text: 'text-red-700',   border: 'border-red-200'   },
}

const ASSET_CLASS_OPTIONS = [
  { value: 'cash',               label: 'Cash / Money Market' },
  { value: 'fixed_income_ig',    label: 'Renta fija IG'       },
  { value: 'fixed_income_hy',    label: 'Renta fija HY / EM'  },
  { value: 'equity_defensive',   label: 'Equity defensivo'    },
  { value: 'equity_diversified', label: 'Equity diversificado'},
  { value: 'equity_growth',      label: 'Equity growth'       },
  { value: 'equity_emerging',    label: 'Equity emergente'    },
  { value: 'real_estate',        label: 'Real Estate'         },
  { value: 'commodity',          label: 'Commodities'         },
  { value: 'crypto',             label: 'Crypto'              },
  { value: 'fund',               label: 'Fondo / ETF'         },
  { value: 'other',              label: 'Otro'                },
]

function periodLabel(p: ScoringPeriod) {
  return `${Q_LABELS[p.period_quarter]} ${p.period_year}`
}

function scoreColor(s: number | null) {
  if (s == null) return 'bg-gray-100 text-gray-400'
  if (s <= 3)  return 'bg-blue-50 text-blue-700'
  if (s <= 6)  return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function ProfileBadge({ profile }: { profile: string | null }) {
  if (!profile) return <span className="text-xs text-gray-400">—</span>
  const c = PROFILE_COLORS[profile] ?? PROFILE_COLORS.moderado
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {profile.charAt(0).toUpperCase() + profile.slice(1)}
    </span>
  )
}

function AlignBadge({ review, client }: { review: string | null; client: string }) {
  if (!review) return <span className="text-xs text-gray-400">—</span>
  return review === client
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">✓ Alineado</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">⚠ Desajuste</span>
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return null
  const pct = (score / 10) * 100
  const color = score <= 3 ? 'bg-blue-400' : score <= 6 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── CSV Download helper ───────────────────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function exportPeriodCSV(period: ScoringPeriod, reviews: PeriodReview[]) {
  const header = [
    'Período', 'N° Cuenta', 'Cliente', 'Asesor', 'Perfil declarado',
    'Score cartera', 'Perfil calculado', 'Alineación',
    'Peso clasificado %', 'Peso pendiente %', 'Archivo', 'Fecha análisis', 'Explicación',
  ]
  const rows = reviews.map(r => [
    periodLabel(period),
    r.client_number ?? '',
    r.client_name ?? '',
    r.advisor ?? '',
    r.client_profile,
    r.portfolio_score?.toFixed(2) ?? '',
    r.portfolio_profile ?? '',
    r.portfolio_profile === r.client_profile ? 'Alineado' : r.portfolio_profile ? 'Desajuste' : 'Pendiente',
    r.classified_weight?.toFixed(1) ?? '',
    r.pending_weight?.toFixed(1) ?? '',
    r.file_name,
    r.created_at.slice(0, 10),
    r.explanation ?? '',
  ])
  downloadCSV([header, ...rows], `scoring_${periodLabel(period).replace(' ', '_')}.csv`)
}

// ─── Create Period Modal ───────────────────────────────────────────────────────

function CreatePeriodModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (period: ScoringPeriod) => void
}) {
  const currentYear = new Date().getFullYear()
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [year, setYear]           = useState(currentYear)
  const [quarter, setQuarter]     = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [period, setPeriod]       = useState<ScoringPeriod | null>(null)
  const [files, setFiles]         = useState<ScoringFile[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [syncing, setSyncing]     = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults]     = useState<AnalysisResult[]>([])
  const [err, setErr]             = useState('')

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/suitability/scoring-files')
    if (res.ok) setFiles(await res.json())
  }, [])

  // Step 1 → create period record
  const handleStep1 = async () => {
    setErr('')
    const res = await fetch('/api/suitability/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_year: year, period_quarter: quarter }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Error'); return }
    setPeriod(data)
    await loadFiles()
    setStep(2)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'scoring' }) })
      await loadFiles()
    } finally {
      setSyncing(false)
    }
  }

  const toggleFile = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const selectAll = () => setSelected(new Set(files.map(f => f.id)))

  // Step 2 → analyze
  const handleStep2 = async () => {
    if (!period || selected.size === 0) return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/suitability/analyze-from-onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoring_file_ids: Array.from(selected),
          client_profile: 'moderado',
          period_id: period.id,
        }),
      })
      const data = await res.json()
      setResults(data.results ?? [])
      // Refresh period stats
      const pr = await fetch(`/api/suitability/periods/${period.id}`)
      if (pr.ok) {
        const { period: updated } = await pr.json()
        if (updated) setPeriod(updated)
        onCreated(updated ?? period)
      }
      setStep(3)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Crear scoring</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 1 ? 'Paso 1 — Seleccioná el período' : step === 2 ? 'Paso 2 — Seleccioná los estados de cuenta' : 'Paso 3 — Resultados'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-6">
          {/* ── Step 1: Period ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Trimestre</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map(q => (
                      <button
                        key={q}
                        onClick={() => setQuarter(q)}
                        className={`py-2.5 rounded-lg text-sm font-medium transition-all border ${
                          quarter === q
                            ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        Q{q}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Año</label>
                  <select
                    value={year}
                    onChange={e => setYear(parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Se va a crear el período:</p>
                <p className="text-xl font-bold text-[#2D3F52] mt-1">
                  {Q_LABELS[quarter]} {year} — {Q_MONTHS[quarter]}
                </p>
              </div>

              {err && <p className="text-sm text-red-500">{err}</p>}

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
                <button
                  onClick={handleStep1}
                  className="px-5 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: File selection ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Seleccioná los estados de cuenta de <span className="font-semibold">{period && periodLabel(period)}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
                  >
                    {syncing ? '⟳ Sincronizando...' : '⟳ Sincronizar OneDrive'}
                  </button>
                  <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Seleccionar todo
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {files.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">
                    No hay archivos. Sincronizá OneDrive para cargar los estados de cuenta.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {files.map(f => (
                        <tr
                          key={f.id}
                          onClick={() => toggleFile(f.id)}
                          className={`cursor-pointer transition-colors ${selected.has(f.id) ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-2.5 w-8">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                              selected.has(f.id) ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                            }`}>
                              {selected.has(f.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 font-medium text-gray-800">{f.name}</td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{f.client_folder ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-xs text-gray-400">{selected.size} archivo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}</p>

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
                <button
                  onClick={handleStep2}
                  disabled={selected.size === 0 || analyzing}
                  className="px-5 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {analyzing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {analyzing ? 'Analizando...' : `Analizar ${selected.size} archivos`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === 3 && (
            <div className="space-y-4">
              {period && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#2D3F52]">{period.total_reviews}</p>
                    <p className="text-xs text-gray-400 mt-0.5">clientes analizados</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{period.clients_aligned}</p>
                    <p className="text-xs text-emerald-600/70 mt-0.5">alineados</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-500">{period.clients_misaligned}</p>
                    <p className="text-xs text-red-400 mt-0.5">desajustes</p>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Archivo</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente detectado</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Vinculación CRM</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 font-medium text-gray-800 text-xs">{r.file_name}</td>
                        <td className="px-4 py-2.5">
                          {r.detected_name
                            ? <>
                                <p className="text-xs text-gray-700 font-medium">{r.detected_name}</p>
                                {r.secondary_holder && (
                                  <p className="text-[10px] text-gray-400">{r.secondary_holder}</p>
                                )}
                              </>
                            : <span className="text-xs text-gray-400">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          {r.error ? null : r.client_name && r.match_confidence != null ? (
                            <div>
                              <p className="text-xs font-medium text-gray-800">{r.client_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {r.match_confidence >= 90
                                  ? <span className="text-[10px] font-medium text-emerald-600">✓ Exacto</span>
                                  : r.match_confidence >= 60
                                    ? <span className="text-[10px] font-medium text-amber-600">~ Sugerido</span>
                                    : <span className="text-[10px] font-medium text-gray-400">~ Posible</span>
                                }
                                <span className="text-[10px] text-gray-300">{r.match_confidence}%</span>
                              </div>
                            </div>
                          ) : r.client_name ? (
                            <p className="text-xs text-gray-500">{r.client_name}</p>
                          ) : (
                            <span className="text-[10px] text-gray-300">Sin match</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.error
                            ? <span className="text-xs text-red-500">{r.error}</span>
                            : <span className="text-xs text-emerald-600 font-medium">✓ OK</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#1f2d3d] transition-colors"
                >
                  Ver resultados
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client Detail Panel ───────────────────────────────────────────────────────

function ClientDetailPanel({ review, onClose }: { review: PeriodReview; onClose: () => void }) {
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch(`/api/suitability/${review.id}`)
      .then(r => r.json())
      .then(d => setPositions(d.positions ?? []))
      .finally(() => setLoading(false))
  }, [review.id])

  const pp = PROFILE_COLORS[review.portfolio_profile ?? ''] ?? PROFILE_COLORS.moderado

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 font-mono">
              {review.client_number ?? review.client_name ?? review.file_name}
            </h2>
            {review.client_number && review.client_name && (
              <p className="text-xs text-gray-500 mt-0.5">{review.client_name}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{review.file_name} · {review.created_at.slice(0, 10)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        {/* Score summary */}
        <div className="px-6 py-4 flex items-center gap-6 border-b border-gray-100 flex-shrink-0 bg-gray-50">
          <div className="text-center">
            <p className="text-3xl font-bold text-[#2D3F52]">{review.portfolio_score?.toFixed(2) ?? '—'}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Score</p>
          </div>
          <div>
            <ProfileBadge profile={review.portfolio_profile} />
            <p className="text-[10px] text-gray-400 mt-1">Perfil calculado</p>
          </div>
          <div>
            <ProfileBadge profile={review.client_profile} />
            <p className="text-[10px] text-gray-400 mt-1">Perfil declarado</p>
          </div>
          <div>
            <AlignBadge review={review.portfolio_profile} client={review.client_profile} />
            <p className="text-[10px] text-gray-400 mt-1">Alineación</p>
          </div>
          {review.pending_weight != null && review.pending_weight > 0 && (
            <div>
              <span className="text-sm font-semibold text-amber-600">{review.pending_weight.toFixed(1)}%</span>
              <p className="text-[10px] text-gray-400 mt-1">Pendiente</p>
            </div>
          )}
        </div>

        {review.explanation && (
          <div className="px-6 py-3 border-b border-gray-100 text-xs text-gray-500 bg-amber-50/40 flex-shrink-0">
            {review.explanation}
          </div>
        )}

        {/* Positions table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando posiciones...</div>
          ) : positions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Sin posiciones disponibles</div>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Identificador</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nombre / Descripción</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Categoría</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Valor</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">% Port.</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fuente</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {positions.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors group" title={p.score_explanation ?? ''}>
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-[10px] font-medium text-gray-700 leading-tight">{p.raw_identifier}</p>
                      {p.ticker && p.ticker !== p.raw_identifier && (
                        <p className="text-[10px] text-gray-400">{p.ticker}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="font-medium text-gray-800 text-xs leading-tight truncate" title={p.raw_name}>{p.raw_name}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-[10px] text-gray-500">{p.security_type ?? p.identifier_type ?? '—'}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.category ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-700 tabular-nums">
                      {p.market_value != null ? `$${p.market_value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 tabular-nums">
                      {p.weight != null ? `${p.weight.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {p.risk_score != null
                        ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${scoreColor(p.risk_score)}`}>{p.risk_score}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-medium ${
                        p.source === 'scoring_base' ? 'text-blue-600'
                        : p.source === 'openfigi' ? 'text-emerald-600'
                        : p.source === 'rules' ? 'text-purple-600'
                        : 'text-gray-400'
                      }`}>
                        {p.source === 'scoring_base' ? 'Base' : p.source === 'openfigi' ? 'OpenFIGI' : p.source === 'rules' ? 'Reglas' : p.source ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        p.classification_status === 'classified' ? 'bg-emerald-50 text-emerald-700'
                        : p.classification_status === 'manual' ? 'bg-purple-50 text-purple-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.classification_status === 'classified' ? 'Auto' : p.classification_status === 'manual' ? 'Regla' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Period View (shared between Actual and Historial) ────────────────────────

function PeriodView({
  period, reviews, onExport, isAdmin, onDelete, onOpenDetail,
}: {
  period: ScoringPeriod
  reviews: PeriodReview[]
  onExport: () => void
  isAdmin: boolean
  onDelete?: () => void
  onOpenDetail: (r: PeriodReview) => void
}) {
  const aligned    = reviews.filter(r => r.portfolio_profile === r.client_profile).length
  const misaligned = reviews.filter(r => r.portfolio_profile && r.portfolio_profile !== r.client_profile).length
  const pending    = reviews.filter(r => !r.portfolio_profile).length

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Clientes analizados', value: reviews.length,  color: 'text-[#2D3F52]' },
          { label: 'Alineados',           value: aligned,         color: 'text-emerald-600' },
          { label: 'Desajuste',           value: misaligned,      color: 'text-red-500' },
          { label: 'Pendientes',          value: pending,         color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Creado el {period.created_at.slice(0, 10)}
          {period.status === 'final' && <span className="ml-2 text-xs text-emerald-600 font-medium">● Final</span>}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
          >
            ↓ Exportar CSV
          </button>
          {isAdmin && onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Eliminar período
            </button>
          )}
        </div>
      </div>

      {/* Client table */}
      {reviews.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">Sin análisis en este período.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Asesor</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">P. declarado</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">P. calculado</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800 font-mono">{r.client_number ?? '—'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.client_name ?? r.file_name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{r.advisor ?? '—'}</td>
                  <td className="px-4 py-3"><ProfileBadge profile={r.client_profile} /></td>
                  <td className="px-4 py-3 text-right">
                    {r.portfolio_score != null ? (
                      <div className="inline-block min-w-[52px]">
                        <span className={`text-sm font-bold px-2 py-1 rounded-lg ${scoreColor(r.portfolio_score)}`}>
                          {r.portfolio_score.toFixed(1)}
                        </span>
                        <ScoreBar score={r.portfolio_score} />
                      </div>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><ProfileBadge profile={r.portfolio_profile} /></td>
                  <td className="px-4 py-3">
                    <AlignBadge review={r.portfolio_profile} client={r.client_profile} />
                    {(r.pending_weight ?? 0) > 10 && (
                      <p className="text-[10px] text-amber-500 mt-0.5">{r.pending_weight?.toFixed(0)}% pendiente</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onOpenDetail(r)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Ver →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Scoring Base Tab ─────────────────────────────────────────────────────────

function ScoringBaseTab({ isAdmin }: { isAdmin: boolean }) {
  const [subTab, setSubTab]       = useState<'all' | 'pending' | 'override'>('all')
  const [entries, setEntries]     = useState<AssetEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterClass, setFilter]  = useState('')
  const [filterReview, setFR]     = useState(false)
  const [editing, setEditing]     = useState<Partial<AssetEntry> | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveErr, setSaveErr]     = useState('')
  const [seeding, setSeeding]     = useState(false)
  const [seedMsg, setSeedMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const importRef                 = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)       params.set('q', search)
    if (filterClass)  params.set('asset_class', filterClass)
    if (filterReview) params.set('needs_review', 'true')
    if (subTab === 'pending')  params.set('status', 'pending')
    if (subTab === 'override') params.set('manual_override', 'true')
    const res = await fetch(`/api/suitability/scoring-base?${params}`)
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [search, filterClass, filterReview, subTab])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!editing) return
    setSaving(true); setSaveErr('')
    try {
      const isNew = !editing.id
      const url   = isNew ? '/api/suitability/scoring-base' : `/api/suitability/scoring-base?id=${editing.id}`
      const res   = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const data = await res.json()
      if (!res.ok) { setSaveErr(data.error ?? 'Error'); return }
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este activo del scoring base?')) return
    await fetch(`/api/suitability/scoring-base?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const handleSeedLoad = async () => {
    if (!confirm('¿Cargar las 115 entradas predeterminadas del Scoring Base? Los activos existentes no serán sobreescritos (ON CONFLICT DO NOTHING).')) return
    setSeeding(true); setSeedMsg(null)
    try {
      const res  = await fetch('/api/suitability/asset-master/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSeedMsg({ ok: false, text: data.error ?? 'Error al cargar' })
      } else {
        setSeedMsg({ ok: true, text: `✓ ${data.inserted} activos insertados, ${data.skipped} ya existían (total ${data.total})` })
        await load()
      }
    } catch {
      setSeedMsg({ ok: false, text: 'Error de red al cargar el scoring base' })
    } finally {
      setSeeding(false)
    }
  }

  const exportCSV = () => {
    const header = ['Identificador', 'Tipo', 'Nombre', 'Símbolo', 'ISIN', 'CUSIP', 'Clase activo', 'Categoría', 'Score', 'Tipo seguridad', 'Explicación', 'Fuente', 'Estado', 'Revisar', 'Veces visto', 'Último cliente', 'Último visto', 'Override manual', 'Actualizado']
    const rows = entries.map(e => [
      e.security_identifier, e.identifier_type ?? '', e.normalized_name ?? '',
      e.symbol ?? '', e.isin ?? '', e.cusip ?? '',
      e.asset_class ?? '', e.category ?? '', String(e.risk_score ?? ''),
      e.security_type ?? '', e.score_explanation ?? '',
      e.source ?? '', e.classification_status ?? '', e.needs_review ? 'Sí' : 'No',
      String(e.times_seen ?? 0), e.last_client_seen ?? '',
      e.last_seen_at ? e.last_seen_at.slice(0, 10) : '',
      e.manual_override ? 'Sí' : 'No', e.updated_at.slice(0, 10),
    ])
    downloadCSV([header, ...rows], 'scoring_base.csv')
  }

  const handleImport = async (file: File) => {
    setImporting(true); setImportMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/suitability/scoring-base/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setImportMsg({ ok: false, text: data.error ?? 'Error al importar' })
      } else {
        setImportMsg({ ok: true, text: `✓ ${data.inserted} activos importados${data.warnings?.length ? ` · ${data.warnings.length} advertencias` : ''}` })
        await load()
      }
    } catch {
      setImportMsg({ ok: false, text: 'Error de red al importar' })
    } finally {
      setImporting(false)
    }
  }

  const SOURCE_COLOR: Record<string, string> = {
    openfigi:     '#16a34a',
    rules:        '#7c3aed',
    manual:       '#2563eb',
    scoring_base: '#6b7280',
    pending:      '#d97706',
  }
  const SOURCE_LABEL: Record<string, string> = {
    openfigi:     'OpenFIGI',
    rules:        'Reglas',
    manual:       'Manual',
    scoring_base: 'Base',
    pending:      'Pendiente',
  }

  const emptyMsg = subTab === 'pending' ? 'Sin activos pendientes de clasificar. ¡La base está al día!'
    : subTab === 'override' ? 'Sin activos con override manual.'
    : 'Sin activos en la base. Subí carteras o importá un Excel.'

  return (
    <div className="space-y-4">
      {/* Inner sub-tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'all',      label: 'Todos' },
            { key: 'pending',  label: 'Pendientes' },
            { key: 'override', label: 'Con override' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${subTab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors">↓ Exportar CSV</button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            {importing ? <><span className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /> Importando...</> : '↑ Importar Excel'}
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
          />
          {isAdmin && (
            <button
              onClick={handleSeedLoad}
              disabled={seeding}
              title="Carga entradas predeterminadas (no sobreescribe existentes)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:border-[#16A34A] hover:text-[#16A34A] transition-colors disabled:opacity-50"
            >
              {seeding ? <><span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /> Cargando...</> : '⬇ Predeterminados'}
            </button>
          )}
          <button
            onClick={() => setEditing({ security_identifier: '', identifier_type: 'isin', risk_score: 5, needs_review: false, classification_status: 'classified', manual_override: false })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] text-white text-xs font-medium rounded-lg hover:bg-[#15803d] transition-colors"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Search & filter bar (only for Todos) */}
      {subTab === 'all' && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por ticker, CUSIP, ISIN o nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
          />
          <select
            value={filterClass}
            onChange={e => setFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
          >
            <option value="">Todas las clases</option>
            {ASSET_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={filterReview} onChange={e => setFR(e.target.checked)} className="rounded" />
            Solo revisar
          </label>
        </div>
      )}

      {/* Feedback banners */}
      {(seedMsg ?? importMsg) && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-medium ${
          (seedMsg ?? importMsg)!.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span>{(seedMsg ?? importMsg)!.text}</span>
          <button onClick={() => { setSeedMsg(null); setImportMsg(null) }} className="ml-4 opacity-60 hover:opacity-100 text-base leading-none">×</button>
        </div>
      )}

      {/* ── Pendientes special view ── */}
      {subTab === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
          Estos activos aparecieron en carteras analizadas pero no se pudo clasificarlos automáticamente. Asigná un score manualmente para que queden guardados en la Scoring Base y no vuelvan a quedar pendientes.
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">{emptyMsg}</div>
        ) : subTab === 'pending' ? (
          // ── Pending assets table (compact assign view) ──────────────────────
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Identificador</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Descripción</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Veces visto</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Último cliente</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-amber-50/40 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs font-medium text-gray-800">{e.security_identifier}</p>
                    <p className="text-[10px] text-gray-400">{e.identifier_type ?? ''}{e.symbol ? ` · ${e.symbol}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <p className="text-xs text-gray-700 truncate" title={e.security_description ?? e.normalized_name ?? ''}>{e.security_description ?? e.normalized_name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-gray-500">{e.security_type ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                      {e.times_seen ?? 1}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{e.last_client_seen ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditing({ ...e, classification_status: 'classified', manual_override: true })}
                      className="px-3 py-1.5 bg-[#2D3F52] text-white text-[10px] font-medium rounded-lg hover:bg-[#1f2d3d] transition-colors"
                    >
                      Asignar score →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          // ── Standard table (Todos / Override) ────────────────────────────────
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Identificador</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nombre / Categoría</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Clase activo</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fuente / Visto</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/60 transition-colors group">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <p className="font-mono text-xs font-medium text-gray-800">{e.security_identifier}</p>
                      {e.manual_override && (
                        <span title={`Override por ${e.manual_override_by ?? 'usuario'} el ${e.manual_override_at?.slice(0,10) ?? ''}`}
                          className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">M</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {e.identifier_type ?? ''}
                      {e.symbol ? ` · ${e.symbol}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs text-gray-800">{e.normalized_name ?? e.security_description ?? '—'}</p>
                    <p className="text-[10px] text-gray-400">{e.category ?? ''}{e.security_type ? ` · ${e.security_type}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-600">{ASSET_CLASS_OPTIONS.find(o => o.value === e.asset_class)?.label ?? e.asset_class ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {e.risk_score != null
                      ? <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${scoreColor(e.risk_score)}`}>{e.risk_score}</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-[10px] font-medium" style={{ color: SOURCE_COLOR[e.source ?? ''] ?? '#6b7280' }}>
                      {SOURCE_LABEL[e.source ?? ''] ?? e.source ?? '—'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {e.times_seen != null ? `${e.times_seen}× visto` : ''}
                      {e.last_client_seen ? ` · ${e.last_client_seen}` : ''}
                    </p>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.needs_review && <span className="text-[10px] text-amber-500 font-medium">⚠</span>}
                      <button onClick={() => setEditing({ ...e })} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                      {isAdmin && <button onClick={() => handleDelete(e.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">×</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-gray-400 text-right">{entries.length} activos · ordenados por frecuencia de aparición</p>

      {/* Edit / Assign Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{editing.id ? 'Editar activo' : 'Agregar activo'}</h2>
                {editing.manual_override && editing.manual_override_by && (
                  <p className="text-[10px] text-blue-600 mt-0.5">Override manual por {editing.manual_override_by} · {editing.manual_override_at?.slice(0,10)}</p>
                )}
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Seen stats (read-only) */}
              {editing.id && (editing.times_seen ?? 0) > 0 && (
                <div className="flex items-center gap-4 bg-gray-50 rounded-lg px-4 py-2.5 text-[11px] text-gray-500">
                  <span>👁 <strong className="text-gray-700">{editing.times_seen}</strong> veces visto</span>
                  {editing.last_client_seen && <span>Último: <strong className="text-gray-700">{editing.last_client_seen}</strong></span>}
                  {editing.first_seen_at && <span>Desde: {editing.first_seen_at.slice(0, 10)}</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Identificador * <span className="text-gray-400 font-normal">(CUSIP / ISIN / Ticker)</span></label>
                  <input
                    type="text"
                    value={editing.security_identifier ?? ''}
                    onChange={e => setEditing(p => ({ ...p, security_identifier: e.target.value.toUpperCase() }))}
                    placeholder="US0378331005"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select
                    value={editing.identifier_type ?? 'isin'}
                    onChange={e => setEditing(p => ({ ...p, identifier_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
                  >
                    <option value="isin">ISIN</option>
                    <option value="cusip">CUSIP</option>
                    <option value="ticker">Ticker</option>
                    <option value="unknown">Otro</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre normalizado</label>
                  <input type="text" value={editing.normalized_name ?? ''} onChange={e => setEditing(p => ({ ...p, normalized_name: e.target.value }))} placeholder="Ej: Apple Inc." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Símbolo / Ticker</label>
                  <input type="text" value={editing.symbol ?? ''} onChange={e => setEditing(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} placeholder="AAPL" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clase de activo</label>
                  <select value={editing.asset_class ?? ''} onChange={e => setEditing(p => ({ ...p, asset_class: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30">
                    <option value="">— seleccionar —</option>
                    {ASSET_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Score de riesgo (1–10) *</label>
                  <input type="number" min={1} max={10} step={0.5} value={editing.risk_score ?? 5} onChange={e => setEditing(p => ({ ...p, risk_score: parseFloat(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                  <input type="text" value={editing.category ?? ''} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} placeholder="Ej: Bono Corporativo EM" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de seguridad</label>
                  <input type="text" value={editing.security_type ?? ''} onChange={e => setEditing(p => ({ ...p, security_type: e.target.value }))} placeholder="Ej: Common Stock, Corporate Bond" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Explicación del score</label>
                <textarea rows={2} value={editing.score_explanation ?? ''} onChange={e => setEditing(p => ({ ...p, score_explanation: e.target.value }))} placeholder="Ej: Equity doméstico, sin apalancamiento" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estado clasificación</label>
                  <select value={editing.classification_status ?? 'classified'} onChange={e => setEditing(p => ({ ...p, classification_status: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30">
                    <option value="classified">Clasificado</option>
                    <option value="manual">Manual</option>
                    <option value="pending">Pendiente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fuente</label>
                  <select value={editing.source ?? 'manual'} onChange={e => setEditing(p => ({ ...p, source: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30">
                    <option value="manual">Manual</option>
                    <option value="openfigi">OpenFIGI</option>
                    <option value="rules">Reglas</option>
                    <option value="scoring_base">Base propia</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.needs_review ?? false} onChange={e => setEditing(p => ({ ...p, needs_review: e.target.checked }))} className="rounded" />
                  <span className="text-sm text-amber-600">Pendiente revisar</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.manual_override ?? false} onChange={e => setEditing(p => ({ ...p, manual_override: e.target.checked }))} className="rounded" />
                  <span className="text-sm text-blue-600" title="Si está activo, el sistema no sobreescribirá el score automáticamente">Override manual 🔒</span>
                </label>
              </div>
              {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {saving ? 'Guardando...' : 'Guardar y fijar score'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ScoringPanel ────────────────────────────────────────────────────────

// ─── Date formatting helper ───────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

export default function ScoringPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab]               = useState<'actual' | 'historial' | 'base'>('actual')
  const [periods, setPeriods]       = useState<ScoringPeriod[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [activeData, setActiveData] = useState<{ period: ScoringPeriod; reviews: PeriodReview[] } | null>(null)
  const [loadingDetail, setLD]      = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [detailReview, setDetailR]  = useState<PeriodReview | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  // Historial state (date-grouped reviews)
  const [historialReviews, setHistorialReviews]   = useState<PeriodReview[]>([])
  const [historialLoading, setHistorialLoading]   = useState(false)
  const [openDates, setOpenDates]                 = useState<Set<string>>(new Set())
  const [deletingReviewId, setDeletingReviewId]   = useState<string | null>(null)

  const loadPeriods = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/suitability/periods')
    if (res.ok) setPeriods(await res.json())
    setLoading(false)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setLD(true); setActiveId(id)
    const res = await fetch(`/api/suitability/periods/${id}`)
    if (res.ok) setActiveData(await res.json())
    setLD(false)
  }, [])

  const loadHistorial = useCallback(async () => {
    setHistorialLoading(true)
    const res = await fetch('/api/suitability/reviews?limit=1000')
    if (res.ok) setHistorialReviews(await res.json())
    setHistorialLoading(false)
  }, [])

  useEffect(() => { loadPeriods() }, [loadPeriods])

  // Load historial when tab opens
  useEffect(() => {
    if (tab === 'historial') loadHistorial()
  }, [tab, loadHistorial])

  // Auto-load latest period for Actual tab
  useEffect(() => {
    if (periods.length > 0 && !activeId) {
      loadDetail(periods[0].id)
    }
  }, [periods, activeId, loadDetail])

  const latest = periods[0] ?? null

  const handleCreated = async (period: ScoringPeriod) => {
    setShowCreate(false)
    await loadPeriods()
    loadDetail(period.id)
    setTab('actual')
  }

  const handleDeletePeriod = async (id: string) => {
    if (!confirm('¿Eliminar este período? Los análisis quedan en historial pero desvinculados.')) return
    setDeleting(id)
    await fetch(`/api/suitability/periods/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (activeId === id) { setActiveId(null); setActiveData(null) }
    await loadPeriods()
  }

  const handleDeleteReview = async (id: string) => {
    if (!confirm('¿Eliminar este análisis? Se borrarán las posiciones asociadas.')) return
    setDeletingReviewId(id)
    await fetch(`/api/suitability/reviews/${id}`, { method: 'DELETE' })
    setDeletingReviewId(null)
    setHistorialReviews(prev => prev.filter(r => r.id !== id))
  }

  // Group historial reviews by date
  const reviewsByDate = historialReviews.reduce((acc, r) => {
    const d = r.created_at.slice(0, 10)
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {} as Record<string, PeriodReview[]>)
  const sortedDates = Object.keys(reviewsByDate).sort((a, b) => b.localeCompare(a))

  // Tab label for Actual
  const actualLabel = latest
    ? `${Q_LABELS[latest.period_quarter]} ${latest.period_year} — Actual`
    : 'Actual'

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'actual',    label: actualLabel },
          { key: 'historial', label: 'Historial', count: sortedDates.length },
          { key: 'base',      label: 'Scoring base' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#16A34A] text-[#2D3F52]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {'count' in t && (t as any).count > 0 &&
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">({(t as any).count})</span>
            }
          </button>
        ))}
      </div>

      {/* ── TAB: ACTUAL ── */}
      {tab === 'actual' && (
        <div>
          {/* Crear scoring button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#1f2d3d] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Crear scoring
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-gray-400">Cargando...</div>
          ) : !latest ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Sin scorings todavía</p>
              <p className="text-xs text-gray-400 mb-4">Creá el primer scoring de cartera para este período.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803d] transition-colors"
              >
                Crear primer scoring
              </button>
            </div>
          ) : loadingDetail ? (
            <div className="text-center py-12 text-sm text-gray-400">Cargando análisis...</div>
          ) : activeData ? (
            <PeriodView
              period={activeData.period}
              reviews={activeData.reviews}
              onExport={() => exportPeriodCSV(activeData.period, activeData.reviews)}
              isAdmin={isAdmin}
              onOpenDetail={setDetailR}
            />
          ) : null}
        </div>
      )}

      {/* ── TAB: HISTORIAL ── */}
      {tab === 'historial' && (
        <div className="space-y-3">
          {historialLoading ? (
            <div className="text-center py-12 text-sm text-gray-400">Cargando...</div>
          ) : sortedDates.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <p className="text-sm text-gray-400">Sin análisis históricos todavía.</p>
            </div>
          ) : (
            sortedDates.map(date => {
              const dayReviews = reviewsByDate[date]
              const isOpen     = openDates.has(date)
              const aligned    = dayReviews.filter(r => r.portfolio_profile === r.client_profile).length
              const misaligned = dayReviews.filter(r => r.portfolio_profile != null && r.portfolio_profile !== r.client_profile).length

              return (
                <div key={date} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                  {/* Date row header */}
                  <button
                    onClick={() => setOpenDates(prev => {
                      const n = new Set(prev)
                      n.has(date) ? n.delete(date) : n.add(date)
                      return n
                    })}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 bg-[#2D3F52]/5 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4.5 h-4.5 text-[#2D3F52]" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#2D3F52]">{formatDate(date)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {dayReviews.length} cuenta{dayReviews.length !== 1 ? 's' : ''} analizadas
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-3">
                        {aligned > 0    && <span className="text-xs text-emerald-600">{aligned} alineadas</span>}
                        {misaligned > 0 && <span className="text-xs text-red-500">{misaligned} desajustes</span>}
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded review table */}
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50/60">
                            <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cuenta</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Asesor</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">P. Decl.</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">P. Calc.</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-5 py-2.5 w-24" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {dayReviews.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50/60 transition-colors group">
                              <td className="px-5 py-3">
                                <p className="font-medium text-gray-800 font-mono">{r.client_number ?? '—'}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{r.client_name ?? r.file_name}</p>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{r.advisor ?? '—'}</td>
                              <td className="px-4 py-3"><ProfileBadge profile={r.client_profile} /></td>
                              <td className="px-4 py-3 text-right">
                                {r.portfolio_score != null ? (
                                  <div className="inline-block min-w-[52px]">
                                    <span className={`text-sm font-bold px-2 py-1 rounded-lg ${scoreColor(r.portfolio_score)}`}>
                                      {r.portfolio_score.toFixed(1)}
                                    </span>
                                    <ScoreBar score={r.portfolio_score} />
                                  </div>
                                ) : <span className="text-xs text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3"><ProfileBadge profile={r.portfolio_profile} /></td>
                              <td className="px-4 py-3">
                                <AlignBadge review={r.portfolio_profile} client={r.client_profile} />
                                {(r.pending_weight ?? 0) > 10 && (
                                  <p className="text-[10px] text-amber-500 mt-0.5">{r.pending_weight?.toFixed(0)}% pendiente</p>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center justify-end gap-3">
                                  <button
                                    onClick={() => setDetailR(r)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                  >
                                    Ver →
                                  </button>
                                  <button
                                    onClick={() => handleDeleteReview(r.id)}
                                    disabled={deletingReviewId === r.id}
                                    title="Eliminar este análisis"
                                    className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                                  >
                                    {deletingReviewId === r.id
                                      ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    }
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── TAB: SCORING BASE ── */}
      {tab === 'base' && <ScoringBaseTab isAdmin={isAdmin} />}

      {/* ── Modals ── */}
      {showCreate && (
        <CreatePeriodModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {detailReview && (
        <ClientDetailPanel review={detailReview} onClose={() => setDetailR(null)} />
      )}
    </div>
  )
}
