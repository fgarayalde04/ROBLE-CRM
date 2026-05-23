'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ASSET_CLASS_LABELS, type AssetClass } from '@/lib/risk-scoring'

type Position = {
  id: string
  raw_name: string
  raw_identifier: string
  identifier_type: string
  cusip?: string
  isin?: string
  ticker?: string
  figi?: string
  quantity?: number
  market_value?: number
  weight?: number
  asset_class: string | null
  risk_score: number | null
  category: string | null
  classification_status: 'classified' | 'pending' | 'manual'
}

type Review = {
  id: string
  client_name: string | null
  client_profile: string
  file_name: string
  portfolio_score: number | null
  portfolio_profile: string | null
  classified_weight: number | null
  pending_weight: number | null
  explanation: string | null
  notes: string | null
  created_at: string
  crm_users?: { name: string } | null
}

const PROFILE_LABELS: Record<string, string> = {
  conservador: 'Conservador',
  moderado:    'Moderado',
  agresivo:    'Agresivo',
}

const PROFILE_COLORS: Record<string, string> = {
  conservador: 'text-blue-600',
  moderado:    'text-amber-600',
  agresivo:    'text-red-600',
}

const SCORE_COLOR = (s: number | null) => {
  if (s == null) return 'bg-gray-100 text-gray-400'
  if (s <= 3.5) return 'bg-blue-50 text-blue-700'
  if (s <= 6.5) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-600'
}

const STATUS_BADGE = (s: Position['classification_status']) => {
  if (s === 'classified') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'manual')     return 'bg-purple-50 text-purple-700 border-purple-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
}

const STATUS_LABEL = (s: Position['classification_status']) => {
  if (s === 'classified') return 'Auto'
  if (s === 'manual')     return 'Manual'
  return 'Pendiente'
}

const ASSET_CLASSES: AssetClass[] = [
  'cash', 'fixed_income_ig', 'fixed_income_hy',
  'equity_defensive', 'equity_diversified', 'equity_growth', 'equity_emerging',
  'real_estate', 'commodity', 'crypto', 'fund', 'other',
]

// Gauge component
function RiskGauge({ score, profile }: { score: number | null; profile: string | null }) {
  if (score == null) return null
  const pct = ((score - 1) / 9) * 100 // 1..10 mapped to 0..100%
  const color = profile === 'conservador' ? '#3b82f6' : profile === 'moderado' ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold" style={{ color }}>{score.toFixed(2)}</span>
        <span className="text-lg text-gray-400 pb-0.5">/10</span>
      </div>
      <div className="relative h-3 bg-gradient-to-r from-blue-200 via-amber-200 to-red-300 rounded-full overflow-hidden">
        {/* tick marks */}
        {[3.5, 6.5].map(t => (
          <div
            key={t}
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${((t - 1) / 9) * 100}%` }}
          />
        ))}
        {/* needle */}
        <div
          className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full bg-gray-700 shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>1 Conservador</span>
        <span>Agresivo 10</span>
      </div>
    </div>
  )
}

export default function ReviewClient({ uploadId }: { uploadId: string }) {
  const [review, setReview]     = useState<Review | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading]   = useState(true)
  const [rescoring, setRescoring] = useState(false)
  const [error, setError]       = useState('')

  // Inline edit state
  const [editId, setEditId]     = useState<string | null>(null)
  const [editAC, setEditAC]     = useState<AssetClass>('other')
  const [editScore, setEditScore] = useState<string>('')
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/suitability/${uploadId}`)
      if (!res.ok) throw new Error('No se pudo cargar el análisis')
      const data = await res.json()
      setReview(data.review)
      setPositions(data.positions)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [uploadId])

  useEffect(() => { load() }, [load])

  const rescore = async () => {
    setRescoring(true)
    try {
      const res = await fetch(`/api/suitability/${uploadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescore' }),
      })
      if (res.ok) {
        const updated = await res.json()
        setReview(prev => prev ? { ...prev, ...updated } : updated)
      }
    } finally {
      setRescoring(false)
    }
  }

  const startEdit = (p: Position) => {
    setEditId(p.id)
    setEditAC((p.asset_class as AssetClass) ?? 'other')
    setEditScore(p.risk_score != null ? String(p.risk_score) : '')
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true)
    try {
      const scoreNum = parseFloat(editScore)
      const res = await fetch(`/api/suitability/positions/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_class: editAC,
          risk_score:  isNaN(scoreNum) ? undefined : scoreNum,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setPositions(prev => prev.map(p => p.id === editId ? { ...p, ...updated } : p))
        setEditId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="py-24 text-center text-sm text-gray-400">Cargando análisis…</div>
    </div>
  )

  if (error) return (
    <div className="p-6 max-w-6xl mx-auto">
      <p className="text-red-500 text-sm">{error}</p>
    </div>
  )

  if (!review) return null

  const aligned = review.portfolio_profile === review.client_profile
  const pendingPositions = positions.filter(p => p.classification_status === 'pending')

  // Asset class breakdown
  const acBreakdown = positions
    .filter(p => p.asset_class && p.weight != null)
    .reduce<Record<string, number>>((acc, p) => {
      const ac = p.asset_class!
      acc[ac] = (acc[ac] ?? 0) + (p.weight ?? 0)
      return acc
    }, {})

  const acSorted = Object.entries(acBreakdown).sort((a, b) => b[1] - a[1])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/suitability" className="hover:text-gray-700 transition-colors">Suitability</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{review.client_name ?? review.file_name}</span>
      </div>

      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm md:col-span-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Score de riesgo</p>
          <RiskGauge score={review.portfolio_score} profile={review.portfolio_profile} />
          <p className={`mt-3 text-sm font-semibold ${PROFILE_COLORS[review.portfolio_profile ?? ''] ?? 'text-gray-600'}`}>
            {PROFILE_LABELS[review.portfolio_profile ?? ''] ?? '—'}
          </p>
        </div>

        {/* Alignment card */}
        <div className={`border rounded-xl p-5 shadow-sm ${aligned ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide mb-2 opacity-60">Alineación</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{aligned ? '✓' : '⚠'}</span>
            <div>
              <p className={`text-sm font-bold ${aligned ? 'text-emerald-700' : 'text-red-700'}`}>
                {aligned ? 'Alineado' : 'Desajuste de perfil'}
              </p>
              <p className="text-xs opacity-70 mt-0.5">
                Perfil cliente: <strong>{PROFILE_LABELS[review.client_profile] ?? review.client_profile}</strong>
                {!aligned && (
                  <> · Cartera: <strong>{PROFILE_LABELS[review.portfolio_profile ?? ''] ?? '—'}</strong></>
                )}
              </p>
            </div>
          </div>
          {review.explanation && (
            <p className="mt-3 text-xs opacity-70 leading-relaxed line-clamp-3">{review.explanation}</p>
          )}
        </div>

        {/* Coverage card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Cobertura</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${review.classified_weight ?? 0}%` }}
                />
              </div>
              <span className="text-xs font-medium text-emerald-600 w-12 text-right">
                {(review.classified_weight ?? 0).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {review.classified_weight != null && review.classified_weight >= 80 ? 'Alta cobertura' : 'Cobertura parcial'} ·{' '}
              {positions.length} posiciones
              {pendingPositions.length > 0 && (
                <> · <span className="text-amber-600 font-medium">{pendingPositions.length} pendientes</span></>
              )}
            </p>
          </div>

          {/* Asset class breakdown */}
          <div className="mt-4 space-y-1.5">
            {acSorted.slice(0, 5).map(([ac, w]) => (
              <div key={ac} className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(w, 100)}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 w-28 text-right truncate">
                  {(ASSET_CLASS_LABELS as any)[ac] ?? ac} {w.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={rescore}
              disabled={rescoring}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {rescoring ? (
                <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Recalculando…</>
              ) : '↻ Recalcular score'}
            </button>
          </div>
        </div>
      </div>

      {/* Positions table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Posiciones ({positions.length})</h2>
          {pendingPositions.length > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              {pendingPositions.length} sin clasificar · asignales clase de activo manualmente
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Instrumento</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Identificador</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Peso</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Valor mercado</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Clase de activo</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Score</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {positions.map(p => (
                <tr key={p.id} className={`transition-colors ${editId === p.id ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-900 text-sm">{p.raw_name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono text-gray-500">
                      {p.isin ?? p.cusip ?? p.ticker ?? p.raw_identifier}
                    </span>
                    {(p.isin ?? p.cusip ?? p.ticker) && (
                      <span className="ml-1 text-[10px] text-gray-400 uppercase">
                        {p.isin ? 'ISIN' : p.cusip ? 'CUSIP' : 'TICKER'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-medium text-gray-800">
                      {p.weight != null ? `${p.weight.toFixed(2)}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                    {p.market_value != null
                      ? new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(p.market_value)
                      : '—'}
                  </td>

                  {/* Editable: asset class */}
                  <td className="px-4 py-2.5">
                    {editId === p.id ? (
                      <select
                        value={editAC}
                        onChange={e => setEditAC(e.target.value as AssetClass)}
                        className="border border-blue-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      >
                        {ASSET_CLASSES.map(ac => (
                          <option key={ac} value={ac}>{(ASSET_CLASS_LABELS as any)[ac] ?? ac}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-700">
                        {p.asset_class ? ((ASSET_CLASS_LABELS as any)[p.asset_class] ?? p.asset_class) : <span className="text-gray-400 italic">Sin clasificar</span>}
                      </span>
                    )}
                  </td>

                  {/* Editable: score */}
                  <td className="px-4 py-2.5 text-center">
                    {editId === p.id ? (
                      <input
                        type="number"
                        min="1" max="10" step="0.5"
                        value={editScore}
                        onChange={e => setEditScore(e.target.value)}
                        className="border border-blue-300 rounded-md px-2 py-1 text-xs w-16 text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    ) : (
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${SCORE_COLOR(p.risk_score)}`}>
                        {p.risk_score != null ? p.risk_score.toFixed(1) : '—'}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE(p.classification_status)}`}>
                      {STATUS_LABEL(p.classification_status)}
                    </span>
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    {editId === p.id ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                        >
                          {saving ? '…' : 'Guardar'}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                        title="Editar clasificación"
                      >
                        ✎
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanation */}
      {review.explanation && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Análisis automático</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{review.explanation}</p>
        </div>
      )}

      {/* Notes */}
      {review.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-medium text-amber-700 mb-1">Notas del asesor</p>
          <p className="text-sm text-amber-800">{review.notes}</p>
        </div>
      )}
    </div>
  )
}
