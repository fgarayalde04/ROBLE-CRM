'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

// ─── FactsheetData (mirrors lib/factsheet-extractor) ─────────────────────────

interface FactsheetData {
  isin:              string | null
  issuer:            string | null
  fund_name:         string | null
  fund_class:        string | null
  return_1y:         number | null
  return_3y:         number | null
  return_5y:         number | null
  ytm_indicative:    number | null
  duration_years:    number | null
  extraction_notes:  string | null
  confidence:        'high' | 'medium' | 'low'
  campos_a_revisar?: string[]
  audit?:            Record<string, { keyword_used: string | null; page: number | null; raw_value: string | null }>
}

// ─── Client Search Field ──────────────────────────────────────────────────────

interface ClientRecord { id: string; first_name: string; last_name: string; client_number?: string }

function ClientSearch({
  value, onSelect,
}: {
  value: string | null
  onSelect: (id: string | null, name: string | null) => void
}) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)
  const wrapRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open || query.length < 1) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`)
        if (res.ok) setResults(await res.json())
      } finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const handleSelect = (c: ClientRecord) => {
    onSelect(c.id, `${c.first_name} ${c.last_name}`)
    setOpen(false)
    setQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(null, null)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Click para cambiar cliente"
        className="text-sm font-medium text-gray-800 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors text-left max-w-[180px] truncate"
      >
        {value || <span className="text-gray-300 italic">Agregar cliente</span>}
      </button>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1 border border-[#1B2E3C]/30 rounded-lg px-2 py-1 bg-white">
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
          placeholder="Buscar cliente..."
          className="text-xs border-none outline-none bg-transparent w-36"
        />
        {loading && <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />}
        {value && (
          <button onClick={handleClear} className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0">×</button>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden w-64">
          {results.map(c => (
            <button key={c.id} onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800">{c.first_name} {c.last_name}</span>
              {c.client_number && <span className="text-gray-400 font-mono text-[10px]">{c.client_number}</span>}
            </button>
          ))}
        </div>
      )}
      {results.length === 0 && query.length >= 1 && !loading && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 px-3 py-2 w-64">
          <p className="text-xs text-gray-400">Sin resultados para "{query}"</p>
        </div>
      )}
    </div>
  )
}

// ─── Factsheet Upload Modal ────────────────────────────────────────────────────

function FactsheetModal({
  proposalId,
  onAdded,
  onClose,
}: {
  proposalId: string
  onAdded: (fund: Fund) => void
  onClose: () => void
}) {
  const [phase, setPhase]         = useState<'upload' | 'extracting' | 'review'>('upload')
  const [drag, setDrag]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [extracted, setExtracted] = useState<FactsheetData | null>(null)
  const [saving, setSaving]       = useState(false)

  // editable fields derived from extracted
  const [fields, setFields] = useState({
    isin:           '' as string,
    fund_name:      '' as string,
    fund_class:     '' as string,
    return_1y:      '' as string,
    return_3y:      '' as string,
    return_5y:      '' as string,
    ytm_indicative: '' as string,
    duration_years: '' as string,
  })

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se aceptan archivos PDF.')
      return
    }
    setError(null)
    setPhase('extracting')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/proposals/extract-factsheet', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Error en la extracción')
      }
      const data: FactsheetData = await res.json()
      setExtracted(data)
      setFields({
        isin:           data.isin           ?? '',
        fund_name:      data.fund_name      ?? '',
        fund_class:     data.fund_class     ?? '',
        return_1y:      data.return_1y      != null ? String(data.return_1y) : '',
        return_3y:      data.return_3y      != null ? String(data.return_3y) : '',
        return_5y:      data.return_5y      != null ? String(data.return_5y) : '',
        ytm_indicative: data.ytm_indicative != null ? String(data.ytm_indicative) : '',
        duration_years: data.duration_years != null ? String(data.duration_years) : '',
      })
      setPhase('review')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setPhase('upload')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleAdd = async () => {
    setSaving(true)
    const toNum = (s: string) => s.trim() === '' ? null : parseFloat(s)
    const body = {
      isin:           fields.isin.trim()   || null,
      issuer:         null,
      fund_name:      fields.fund_name.trim() || null,
      fund_class:     fields.fund_class.trim() || null,
      return_1y:      toNum(fields.return_1y),
      return_3y:      toNum(fields.return_3y),
      return_5y:      toNum(fields.return_5y),
      ytm_indicative: toNum(fields.ytm_indicative),
      duration_years: toNum(fields.duration_years),
      pct:            0,
      amount:         0,
      needs_review:   extracted?.confidence !== 'high',
      data_source:    'factsheet',
    }
    const res = await fetch(`/api/proposals/${proposalId}/funds`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (res.ok) {
      const fund: Fund = await res.json()
      onAdded(fund)
      onClose()
    } else {
      setError('Error al guardar el fondo.')
      setSaving(false)
    }
  }

  const confBadge = {
    high:   { label: 'Alta confianza',  cls: 'bg-emerald-100 text-emerald-700' },
    medium: { label: 'Confianza media', cls: 'bg-amber-100 text-amber-700'    },
    low:    { label: 'Baja confianza',  cls: 'bg-red-100 text-red-600'        },
  }

  // Which field keys map to editable form fields
  const AUDIT_LABELS: Record<string, string> = {
    isin: 'ISIN', issuer: 'Emisor', fund_name: 'Fondo',
    return_1y: '1 Año', return_3y: '3 Años', return_5y: '5 Años',
    ytm: 'YTM', duration: 'Duración',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B2E3C' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Cargar Factsheet PDF</p>
              <p className="text-[10px] text-gray-400">
                {phase === 'upload' ? 'Arrastrá o seleccioná un PDF'
                  : phase === 'extracting' ? 'Extrayendo datos...'
                  : 'Revisá los datos extraídos'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none">×</button>
        </div>

        <div className="p-5">
          {/* ── Upload phase ── */}
          {phase === 'upload' && (
            <div>
              <label
                className={`flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer py-10 ${drag ? 'border-[#1B2E3C] bg-[#1B2E3C]/5' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${drag ? 'bg-[#1B2E3C]/10' : 'bg-gray-100'}`}>
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Arrastrá el PDF aquí</p>
                  <p className="text-xs text-gray-400 mt-0.5">o hacé click para buscar el archivo</p>
                </div>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
              </label>
              {error && <p className="mt-3 text-xs text-red-500 text-center">{error}</p>}
            </div>
          )}

          {/* ── Extracting phase ── */}
          {phase === 'extracting' && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1B2E3C' }}>
                <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Analizando el factsheet...</p>
                <p className="text-xs text-gray-400 mt-1">Esto puede demorar unos segundos</p>
              </div>
            </div>
          )}

          {/* ── Review phase ── */}
          {phase === 'review' && extracted && (
            <div className="space-y-4">
              {/* Confidence + campos a revisar */}
              <div className="flex items-start gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ${confBadge[extracted.confidence].cls}`}>
                  {confBadge[extracted.confidence].label}
                </span>
                {'campos_a_revisar' in extracted && (extracted as FactsheetData & { campos_a_revisar: string[] }).campos_a_revisar.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-amber-600 font-semibold">Revisar:</span>
                    {(extracted as FactsheetData & { campos_a_revisar: string[] }).campos_a_revisar.map(f => (
                      <span key={f} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'isin',       label: 'ISIN',  mono: true,  auditKey: 'isin'      },
                  { key: 'fund_class', label: 'Clase', mono: false, auditKey: 'fund_name' },
                ].map(f => {
                  const a = (extracted as FactsheetData & { audit: Record<string, { keyword_used: string | null; page: number | null }> }).audit?.[f.auditKey]
                  const needsReview = 'campos_a_revisar' in extracted &&
                    (extracted as FactsheetData & { campos_a_revisar: string[] }).campos_a_revisar
                      .some(r => r.toLowerCase().includes(f.label.toLowerCase()))
                  return (
                    <div key={f.key} className={f.key === 'issuer' ? 'col-span-2' : ''}>
                      <div className="flex items-center gap-1 mb-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wider ${needsReview ? 'text-amber-500' : 'text-gray-400'}`}>{f.label}</label>
                        {needsReview && <span className="text-amber-500 text-[10px]">⚠</span>}
                        {a?.keyword_used && a.keyword_used !== 'heuristic' && a.keyword_used !== 'pattern' && (
                          <span className="text-[9px] text-gray-300 ml-auto" title={`Encontrado con: "${a.keyword_used}"${a.page ? ` (pág. ${a.page})` : ''}`}>
                            🔍 {a.keyword_used}{a.page ? ` p.${a.page}` : ''}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={fields[f.key as keyof typeof fields]}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none transition-colors ${needsReview ? 'border-amber-300 bg-amber-50/30 focus:border-amber-400' : 'border-gray-200 focus:border-[#1B2E3C]/40'} ${f.mono ? 'font-mono' : ''}`}
                        placeholder={needsReview ? 'Completar manualmente' : f.label}
                      />
                    </div>
                  )
                })}

                {/* Full-width fund name */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Nombre del Fondo</label>
                  <input
                    type="text"
                    value={fields.fund_name}
                    onChange={e => setFields(prev => ({ ...prev, fund_name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1B2E3C]/40 transition-colors"
                    placeholder="Nombre completo del fondo"
                  />
                </div>

                {/* Numeric fields */}
                {[
                  { key: 'return_1y',      label: 'Retorno 1 Año (%)',  auditKey: 'return_1y', revisar: 'Rentabilidad 1 año' },
                  { key: 'return_3y',      label: 'Retorno 3 Años (%)', auditKey: 'return_3y', revisar: 'Rentabilidad 3 años' },
                  { key: 'return_5y',      label: 'Retorno 5 Años (%)', auditKey: 'return_5y', revisar: 'Rentabilidad 5 años' },
                  { key: 'ytm_indicative', label: 'YTM Indicativo (%)', auditKey: 'ytm',       revisar: 'YTM' },
                  { key: 'duration_years', label: 'Duración (años)',     auditKey: 'duration',  revisar: 'Duración' },
                ].map(f => {
                  const a = (extracted as FactsheetData & { audit: Record<string, { keyword_used: string | null; page: number | null }> }).audit?.[f.auditKey]
                  const needsReview = 'campos_a_revisar' in extracted &&
                    (extracted as FactsheetData & { campos_a_revisar: string[] }).campos_a_revisar.includes(f.revisar)
                  return (
                    <div key={f.key}>
                      <div className="flex items-center gap-1 mb-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wider ${needsReview ? 'text-amber-500' : 'text-gray-400'}`}>{f.label}</label>
                        {needsReview && <span className="text-amber-500 text-[10px]">⚠</span>}
                        {a?.keyword_used && (
                          <span className="text-[9px] text-gray-300 ml-auto" title={`Encontrado con: "${a.keyword_used}"${a.page ? ` (pág. ${a.page})` : ''}`}>
                            🔍 {a.keyword_used}{a.page ? ` p.${a.page}` : ''}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={fields[f.key as keyof typeof fields]}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none transition-colors font-mono ${needsReview ? 'border-amber-300 bg-amber-50/30 focus:border-amber-400' : 'border-gray-200 focus:border-[#1B2E3C]/40'}`}
                        placeholder={needsReview ? 'Completar manualmente' : '—'}
                      />
                    </div>
                  )
                })}
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => { setPhase('upload'); setError(null) }}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cargar otro
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#1B2E3C' }}
                >
                  {saving
                    ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Agregando...</>
                    : <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Agregar a propuesta
                      </>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ProposalPDFTemplate = dynamic(
  () => import('./ProposalPDFTemplate'),
  { ssr: false },
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Proposal {
  id: string
  client_id: string | null
  client_name: string | null
  advisor_name: string | null
  total_amount: number
  currency: string
  title: string | null
  status: string
  notes: string | null
  disclaimer: string | null
  created_at: string
}

interface Fund {
  id: string
  isin: string | null
  issuer: string | null
  fund_name: string | null
  fund_class: string | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  ytm_indicative: number | null
  duration_years: number | null
  pct: number
  amount: number
  needs_review: boolean
  data_source: string
}

interface Bond {
  id: string
  isin: string | null
  issuer: string | null
  bond_type: string | null
  price: number | null
  currency: string
  maturity_date: string | null
  coupon: number | null
  yield: number | null
  duration: number | null
  rating: string | null
  pct: number
  amount: number
}

interface Equity {
  id: string
  ticker: string | null
  company_name: string | null
  sector: string | null
  country: string | null
  currency: string
  pct: number
  amount: number
}

// ─── Calculator ───────────────────────────────────────────────────────────────

function calcAmounts<T extends { pct: number }>(items: T[], total: number): (T & { amount: number })[] {
  return items.map(i => ({ ...i, amount: Math.round(total * (i.pct ?? 0)) / 100 }))
}

function totalPct(funds: Fund[], bonds: Bond[], equities: Equity[]): number {
  const sum = (arr: { pct: number }[]) => arr.reduce((s, i) => s + (i.pct ?? 0), 0)
  return sum(funds) + sum(bonds) + sum(equities)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function pctColor(n: number | null) {
  if (n == null) return 'text-gray-400'
  return n >= 0 ? 'text-emerald-600' : 'text-red-500'
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditCell({
  value, onChange, placeholder = '—', numeric = false, mono = false, className = '',
}: {
  value: string | number | null
  onChange: (v: string) => void
  placeholder?: string
  numeric?: boolean
  mono?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  const start = () => {
    setLocal(value != null ? String(value) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    setEditing(false)
    onChange(local)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={numeric ? 'number' : 'text'}
        step={numeric ? '0.01' : undefined}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className={`w-full bg-[#F0FDF4] border border-[#16A34A]/40 rounded px-1.5 py-0.5 text-sm focus:outline-none ${mono ? 'font-mono' : ''} ${className}`}
        style={{ minWidth: 60 }}
      />
    )
  }

  return (
    <span
      onClick={start}
      title="Click para editar"
      className={`cursor-text hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors inline-block min-w-[2rem] ${value == null || value === '' ? 'text-gray-300' : ''} ${mono ? 'font-mono' : ''} ${className}`}
    >
      {value != null && value !== '' ? String(value) : placeholder}
    </span>
  )
}

// ─── Allocation Panel ─────────────────────────────────────────────────────────

function AllocationPanel({
  total, currency, funds, bonds, equities,
}: {
  total: number; currency: string; funds: Fund[]; bonds: Bond[]; equities: Equity[]
}) {
  const sumFunds    = funds.reduce((s, f) => s + (f.pct ?? 0), 0)
  const sumBonds    = bonds.reduce((s, b) => s + (b.pct ?? 0), 0)
  const sumEquities = equities.reduce((s, e) => s + (e.pct ?? 0), 0)
  const sumTotal    = sumFunds + sumBonds + sumEquities
  const remaining   = 100 - sumTotal
  const isValid     = Math.abs(remaining) < 0.01

  const amtFunds    = Math.round(total * sumFunds    / 100)
  const amtBonds    = Math.round(total * sumBonds    / 100)
  const amtEquities = Math.round(total * sumEquities / 100)

  const barColor = isValid ? 'bg-emerald-500' : sumTotal > 100 ? 'bg-red-500' : 'bg-amber-500'

  // Yield promedio ponderado por % de asignación
  const yieldItems: { pct: number; yield: number }[] = [
    ...funds.filter(f => f.ytm_indicative != null && f.pct > 0).map(f => ({ pct: f.pct, yield: f.ytm_indicative! })),
    ...bonds.filter(b => b.yield         != null && b.pct > 0).map(b => ({ pct: b.pct, yield: b.yield! })),
  ]
  const yieldPctSum = yieldItems.reduce((s, i) => s + i.pct, 0)
  const avgYield    = yieldPctSum > 0
    ? yieldItems.reduce((s, i) => s + i.yield * i.pct, 0) / yieldPctSum
    : null

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 sticky top-4">
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Monto total</p>
        <p className="text-2xl font-bold text-[#2D3F52] font-mono tabular-nums">{fmtMoney(total, currency)}</p>
      </div>

      <div className="space-y-3">
        {[
          { label: 'Fondos',   pct: sumFunds,    amt: amtFunds,    color: 'bg-blue-400' },
          { label: 'Bonos',    pct: sumBonds,    amt: amtBonds,    color: 'bg-amber-400' },
          { label: 'Acciones', pct: sumEquities, amt: amtEquities, color: 'bg-emerald-400' },
        ].map(row => (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 font-medium">{row.label}</span>
              <span className="text-xs font-semibold text-gray-700 tabular-nums">{row.pct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${Math.min(row.pct, 100)}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 text-right font-mono tabular-nums">
              {fmtMoney(row.amt, currency)}
            </p>
          </div>
        ))}
      </div>

      <div className={`border-t pt-3 ${isValid ? 'border-emerald-200' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">Total asignado</span>
          <span className={`text-sm font-bold tabular-nums ${isValid ? 'text-emerald-600' : sumTotal > 100 ? 'text-red-500' : 'text-amber-600'}`}>
            {sumTotal.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(sumTotal, 100)}%` }} />
        </div>
        {!isValid && (
          <p className={`text-[11px] mt-2 font-medium ${sumTotal > 100 ? 'text-red-500' : 'text-amber-600'}`}>
            {sumTotal > 100
              ? `⚠ Excedés ${(sumTotal - 100).toFixed(1)}%`
              : `Faltan ${remaining.toFixed(1)}%`
            }
          </p>
        )}
        {isValid && (
          <p className="text-[11px] mt-2 text-emerald-600 font-medium">✓ Asignación completa</p>
        )}
      </div>

      {/* Yield promedio ponderado */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Yield prom. portafolio</p>
            <p className="text-[9px] text-gray-300 mt-0.5">Fondos (YTM) + Bonos · ponderado por %</p>
          </div>
          <span className={`text-lg font-bold tabular-nums font-mono ${avgYield != null ? 'text-[#2D3F52]' : 'text-gray-300'}`}>
            {avgYield != null ? `${avgYield.toFixed(2)}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Funds Table — estilo institucional ──────────────────────────────────────

const TH = 'px-3 py-2.5 text-[9px] font-bold text-white uppercase tracking-wider whitespace-nowrap'
const TD = 'px-3 py-2.5 text-xs border-b border-gray-100'

function FundsTable({
  proposalId, total, currency, funds, onUpdate,
}: {
  proposalId: string; total: number; currency: string; funds: Fund[]; onUpdate: (funds: Fund[]) => void
}) {
  const [adding, setAdding]       = useState(false)
  const [saving, setSaving]       = useState<string | null>(null)
  const [showFactsheet, setShowFactsheet] = useState(false)

  const updateField = useCallback(async (fund: Fund, field: keyof Fund, raw: string) => {
    const isNumeric = ['pct','return_1y','return_3y','return_5y','ytm_indicative','duration_years'].includes(field)
    const value = isNumeric ? (raw === '' ? null : parseFloat(raw)) : (raw === '' ? null : raw)
    const updated = funds.map(f => {
      if (f.id !== fund.id) return f
      const next = { ...f, [field]: value } as Fund
      if (field === 'pct') next.amount = Math.round(total * (value as number ?? 0) / 100)
      return next
    })
    onUpdate(updated)
    setSaving(fund.id)
    const patchBody: Record<string, unknown> = { fund_id: fund.id, [field]: value }
    if (field === 'pct') patchBody.amount = Math.round(total * (value as number ?? 0) / 100)
    await fetch(`/api/proposals/${proposalId}/funds`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody),
    })
    setSaving(null)
  }, [funds, total, proposalId, onUpdate])

  const addFund = async () => {
    setAdding(true)
    const res = await fetch(`/api/proposals/${proposalId}/funds`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pct: 0, amount: 0 }),
    })
    const data = await res.json()
    if (res.ok) onUpdate([...funds, data])
    setAdding(false)
  }

  const deleteFund = async (id: string) => {
    onUpdate(funds.filter(f => f.id !== id))
    await fetch(`/api/proposals/${proposalId}/funds?fund_id=${id}`, { method: 'DELETE' })
  }

  const totalFundsPct = funds.reduce((s, f) => s + (f.pct ?? 0), 0)
  const totalFundsAmt = funds.reduce((s, f) => s + (f.amount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#2D3F52] flex items-center gap-2">
          <span className="w-5 h-5 bg-[#1B2E3C] rounded flex items-center justify-center text-[10px] text-white font-bold">F</span>
          Fondos de Inversión
          {funds.length > 0 && <span className="text-[10px] font-normal text-gray-400">({funds.length})</span>}
        </h3>
        <div className="flex items-center gap-2">
          {/* Factsheet PDF button */}
          <button
            onClick={() => setShowFactsheet(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#1B2E3C] border border-[#1B2E3C]/30 rounded-lg hover:bg-[#1B2E3C]/5 transition-colors font-medium"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Cargar Factsheet
          </button>
          <button
            onClick={addFund} disabled={adding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#16A34A] border border-[#16A34A]/40 rounded-lg hover:bg-[#16A34A]/5 transition-colors disabled:opacity-50"
          >
            {adding
              ? <span className="w-3 h-3 border-2 border-gray-300 border-t-[#16A34A] rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            }
            Agregar fondo
          </button>
        </div>
      </div>

      {/* Factsheet modal */}
      {showFactsheet && (
        <FactsheetModal
          proposalId={proposalId}
          onAdded={fund => onUpdate([...funds, fund])}
          onClose={() => setShowFactsheet(false)}
        />
      )}

      {funds.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">Sin fondos. Hacé click en "Agregar fondo".</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-[#E2E8F0]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr style={{ backgroundColor: '#1B2E3C' }}>
                  <th className={`${TH} text-left w-24`}>ISIN</th>
                  <th className={`${TH} text-left`}>ACTIVO</th>
                  <th className={`${TH} text-right w-16`}>1 AÑO</th>
                  <th className={`${TH} text-right w-16`}>3 AÑOS</th>
                  <th className={`${TH} text-right w-16`}>5 AÑOS</th>
                  <th className={`${TH} text-right w-20`}>YTM IND.</th>
                  <th className={`${TH} text-right w-16`}>DUR. (a)</th>
                  <th className={`${TH} text-right w-12`}>%</th>
                  <th className={`${TH} text-right w-28`}>TOTAL</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {funds.map((f, i) => (
                  <tr key={f.id} className={`group transition-colors hover:bg-blue-50/30 ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} ${f.needs_review ? '!bg-amber-50/40' : ''}`}>
                    <td className={`${TD} font-mono text-[10px]`}>
                      <EditCell value={f.isin} onChange={v => updateField(f, 'isin', v)} placeholder="ISIN" mono />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <EditCell value={f.fund_name} onChange={v => updateField(f, 'fund_name', v)} placeholder="Nombre del fondo" />
                        {f.fund_class && <span className="text-[9px] font-bold bg-[#1B2E3C]/10 text-[#1B2E3C] px-1 py-0.5 rounded">{f.fund_class}</span>}
                        {f.needs_review && <span className="text-[9px] text-amber-500" title="Revisar">⚠</span>}
                        {saving === f.id && <span className="w-2.5 h-2.5 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />}
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <EditCell value={f.return_1y} onChange={v => updateField(f, 'return_1y', v)} placeholder="—" numeric className={`text-right text-xs ${pctColor(f.return_1y)}`} />
                    </td>
                    <td className={`${TD} text-right`}>
                      <EditCell value={f.return_3y} onChange={v => updateField(f, 'return_3y', v)} placeholder="—" numeric className={`text-right text-xs ${pctColor(f.return_3y)}`} />
                    </td>
                    <td className={`${TD} text-right`}>
                      <EditCell value={f.return_5y} onChange={v => updateField(f, 'return_5y', v)} placeholder="—" numeric className={`text-right text-xs ${pctColor(f.return_5y)}`} />
                    </td>
                    <td className={`${TD} text-right`}>
                      <EditCell value={f.ytm_indicative} onChange={v => updateField(f, 'ytm_indicative', v)} placeholder="—" numeric className="text-right text-xs" />
                    </td>
                    <td className={`${TD} text-right`}>
                      <EditCell value={f.duration_years} onChange={v => updateField(f, 'duration_years', v)} placeholder="—" numeric className="text-right text-xs" />
                    </td>
                    <td className={`${TD} text-right font-semibold`}>
                      <EditCell value={f.pct} onChange={v => updateField(f, 'pct', v)} placeholder="0" numeric className="text-right text-sm font-bold text-[#1B2E3C]" />
                    </td>
                    <td className={`${TD} text-right font-semibold font-mono tabular-nums text-[#1B2E3C]`}>
                      {f.pct > 0 ? fmtMoney(Math.round(total * f.pct / 100), currency) : '—'}
                    </td>
                    <td className="border-b border-gray-100 pr-2 py-2.5">
                      <button onClick={() => deleteFund(f.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr style={{ backgroundColor: '#1B2E3C' }}>
                  <td colSpan={7} className="px-3 py-2.5 text-[9px] text-white/40 uppercase tracking-widest">Total fondos</td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold text-white">{totalFundsPct.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold text-white font-mono tabular-nums">
                    {fmtMoney(totalFundsAmt, currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bonds Table ──────────────────────────────────────────────────────────────

function BondsTable({
  proposalId, total, currency, bonds, onUpdate,
}: {
  proposalId: string; total: number; currency: string; bonds: Bond[]; onUpdate: (b: Bond[]) => void
}) {
  const [adding, setAdding] = useState(false)

  const updateField = useCallback(async (bond: Bond, field: keyof Bond, raw: string) => {
    const numFields = ['pct','coupon','yield','duration','price']
    const value = numFields.includes(field) ? (raw === '' ? null : parseFloat(raw)) : (raw === '' ? null : raw)
    const updated = bonds.map(b => {
      if (b.id !== bond.id) return b
      const next = { ...b, [field]: value } as Bond
      if (field === 'pct') next.amount = Math.round(total * (value as number ?? 0) / 100)
      return next
    })
    onUpdate(updated)

    const body: Record<string, unknown> = { bond_id: bond.id, [field]: value }
    if (field === 'pct') body.amount = Math.round(total * (value as number ?? 0) / 100)
    await fetch(`/api/proposals/${proposalId}/bonds`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  }, [bonds, total, proposalId, onUpdate])

  const addBond = async () => {
    setAdding(true)
    const res = await fetch(`/api/proposals/${proposalId}/bonds`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pct: 0, amount: 0 }),
    })
    const data = await res.json()
    if (res.ok) onUpdate([...bonds, data])
    setAdding(false)
  }

  const deleteBond = async (id: string) => {
    onUpdate(bonds.filter(b => b.id !== id))
    await fetch(`/api/proposals/${proposalId}/bonds?bond_id=${id}`, { method: 'DELETE' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#2D3F52] flex items-center gap-2">
          <span className="w-5 h-5 bg-amber-100 rounded flex items-center justify-center text-[10px] text-amber-700 font-bold">B</span>
          Bonos
          {bonds.length > 0 && <span className="text-[10px] font-normal text-gray-400">({bonds.length})</span>}
        </h3>
        <button
          onClick={addBond}
          disabled={adding}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
        >
          {adding
            ? <span className="w-3 h-3 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
            : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          }
          Agregar bono
        </button>
      </div>

      {bonds.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">Sin bonos. Hacé click en "Agregar bono".</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Emisor','ISIN','Precio','Moneda','Vencimiento','Cupón %','Yield %','Dur. (a)','Rating','%','Total',''].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider ${h === '' ? 'w-8' : h === 'Total' || h === '%' || h === 'Precio' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bonds.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-3 py-2.5"><EditCell value={b.issuer}   onChange={v => updateField(b, 'issuer',   v)} placeholder="Emisor" /></td>
                    <td className="px-3 py-2.5"><EditCell value={b.isin}     onChange={v => updateField(b, 'isin',     v)} placeholder="ISIN" mono /></td>
                    <td className="px-3 py-2.5 text-right"><EditCell value={b.price} onChange={v => updateField(b, 'price', v)} numeric placeholder="—" className="text-right text-xs" /></td>
                    <td className="px-3 py-2.5"><EditCell value={b.currency} onChange={v => updateField(b, 'currency', v)} placeholder="USD" /></td>
                    <td className="px-3 py-2.5"><EditCell value={b.maturity_date} onChange={v => updateField(b, 'maturity_date', v)} placeholder="AAAA-MM-DD" /></td>
                    <td className="px-3 py-2.5 text-right"><EditCell value={b.coupon}   onChange={v => updateField(b, 'coupon',   v)} numeric placeholder="—" className="text-right text-xs" /></td>
                    <td className="px-3 py-2.5 text-right"><EditCell value={b.yield}    onChange={v => updateField(b, 'yield',    v)} numeric placeholder="—" className={`text-right text-xs ${pctColor(b.yield)}`} /></td>
                    <td className="px-3 py-2.5 text-right"><EditCell value={b.duration} onChange={v => updateField(b, 'duration', v)} numeric placeholder="—" className="text-right text-xs" /></td>
                    <td className="px-3 py-2.5"><EditCell value={b.rating}        onChange={v => updateField(b, 'rating',        v)} placeholder="—" /></td>
                    <td className="px-3 py-2.5 text-right">
                      <EditCell value={b.pct} onChange={v => updateField(b, 'pct', v)} numeric placeholder="0" className="text-right text-sm font-semibold text-[#2D3F52]" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-xs font-medium text-gray-700 font-mono tabular-nums">
                        {b.pct > 0 ? fmtMoney(Math.round(total * b.pct / 100), currency) : '—'}
                      </span>
                    </td>
                    <td className="pr-2 py-2.5">
                      <button onClick={() => deleteBond(b.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Equities Table ───────────────────────────────────────────────────────────

function EquitiesTable({
  proposalId, total, currency, equities, onUpdate,
}: {
  proposalId: string; total: number; currency: string; equities: Equity[]; onUpdate: (e: Equity[]) => void
}) {
  const [adding, setAdding]     = useState(false)
  const [lookingUp, setLookingUp] = useState<string | null>(null) // equity id being looked up

  const patchEquity = useCallback(async (id: string, fields: Partial<Equity>) => {
    const body: Record<string, unknown> = { equity_id: id, ...fields }
    if ('pct' in fields) body.amount = Math.round(total * ((fields.pct as number) ?? 0) / 100)
    await fetch(`/api/proposals/${proposalId}/equities`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  }, [total, proposalId])

  const updateField = useCallback(async (eq: Equity, field: keyof Equity, raw: string) => {
    const value = field === 'pct' ? (raw === '' ? 0 : parseFloat(raw)) : (raw === '' ? null : raw)
    const updated = equities.map(e => {
      if (e.id !== eq.id) return e
      const next = { ...e, [field]: value } as Equity
      if (field === 'pct') next.amount = Math.round(total * (value as number) / 100)
      return next
    })
    onUpdate(updated)
    await patchEquity(eq.id, { [field]: value } as Partial<Equity>)

    // Auto-lookup when ticker changes
    if (field === 'ticker' && raw.trim()) {
      setLookingUp(eq.id)
      try {
        const res = await fetch(`/api/equities/lookup?ticker=${encodeURIComponent(raw.trim())}`)
        if (res.ok) {
          const info = await res.json()
          const autoFields: Partial<Equity> = {}
          if (info.company) autoFields.company_name = info.company
          if (info.sector)  autoFields.sector        = info.sector
          if (info.country) autoFields.country       = info.country
          if (Object.keys(autoFields).length > 0) {
            onUpdate(equities.map(e => e.id === eq.id ? { ...e, ticker: raw.trim(), ...autoFields } : e))
            await patchEquity(eq.id, autoFields)
          }
        }
      } catch { /* ignore */ }
      setLookingUp(null)
    }
  }, [equities, total, proposalId, onUpdate, patchEquity])

  const addEquity = async () => {
    setAdding(true)
    const res = await fetch(`/api/proposals/${proposalId}/equities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pct: 0, amount: 0 }),
    })
    const data = await res.json()
    if (res.ok) onUpdate([...equities, data])
    setAdding(false)
  }

  const deleteEquity = async (id: string) => {
    onUpdate(equities.filter(e => e.id !== id))
    await fetch(`/api/proposals/${proposalId}/equities?equity_id=${id}`, { method: 'DELETE' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#2D3F52] flex items-center gap-2">
          <span className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center text-[10px] text-emerald-700 font-bold">A</span>
          Acciones
          {equities.length > 0 && <span className="text-[10px] font-normal text-gray-400">({equities.length})</span>}
        </h3>
        <button
          onClick={addEquity}
          disabled={adding}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-600 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          {adding
            ? <span className="w-3 h-3 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          }
          Agregar acción
        </button>
      </div>

      {equities.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">Sin acciones. Hacé click en "Agregar acción".</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Ticker','Empresa','Sector','País','Moneda','%','Total',''].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider ${h === '' ? 'w-8' : h === 'Total' || h === '%' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {equities.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <EditCell value={e.ticker} onChange={v => updateField(e, 'ticker', v)} placeholder="AAPL" mono />
                        {lookingUp === e.id && (
                          <span className="w-3 h-3 border border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin flex-shrink-0" title="Buscando info..." />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><EditCell value={e.company_name} onChange={v => updateField(e, 'company_name', v)} placeholder="Empresa" /></td>
                    <td className="px-3 py-2.5"><EditCell value={e.sector}       onChange={v => updateField(e, 'sector',       v)} placeholder="Sector" /></td>
                    <td className="px-3 py-2.5"><EditCell value={e.country}      onChange={v => updateField(e, 'country',      v)} placeholder="País" /></td>
                    <td className="px-3 py-2.5"><EditCell value={e.currency}     onChange={v => updateField(e, 'currency',     v)} placeholder="USD" /></td>
                    <td className="px-3 py-2.5 text-right">
                      <EditCell value={e.pct} onChange={v => updateField(e, 'pct', v)} numeric placeholder="0" className="text-right text-sm font-semibold text-[#2D3F52]" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-xs font-medium text-gray-700 font-mono tabular-nums">
                        {e.pct > 0 ? fmtMoney(Math.round(total * e.pct / 100), currency) : '—'}
                      </span>
                    </td>
                    <td className="pr-2 py-2.5">
                      <button onClick={() => deleteEquity(e.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Borrador',  color: 'text-gray-600',    bg: 'bg-gray-100'   },
  review:   { label: 'Revisión',  color: 'text-amber-700',   bg: 'bg-amber-50'   },
  sent:     { label: 'Enviada',   color: 'text-blue-700',    bg: 'bg-blue-50'    },
  accepted: { label: 'Aceptada',  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  archived: { label: 'Archivada', color: 'text-gray-400',    bg: 'bg-gray-50'    },
}

// ─── Main ProposalEditor ──────────────────────────────────────────────────────

export default function ProposalEditor({
  initialProposal,
  initialFunds,
  initialBonds,
  initialEquities,
}: {
  initialProposal: Proposal
  initialFunds: Fund[]
  initialBonds: Bond[]
  initialEquities: Equity[]
}) {
  const router                          = useRouter()
  const [proposal, setProposal]         = useState<Proposal>(initialProposal)
  const [funds, setFunds]               = useState<Fund[]>(initialFunds)
  const [bonds, setBonds]               = useState<Bond[]>(initialBonds)
  const [equities, setEquities]         = useState<Equity[]>(initialEquities)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusMenu, setStatusMenu]     = useState(false)
  const [showPDF, setShowPDF]           = useState(false)
  const [downloading, setDownloading]   = useState(false)
  const pdfRef                          = useRef<HTMLDivElement>(null)

  const handleDownloadPDF = async () => {
    if (!pdfRef.current) return
    setDownloading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: pdfRef.current.scrollWidth,
      })
      // A4 landscape: 297mm × 210mm
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgRatio = canvas.height / canvas.width
      const imgH = pdfW * imgRatio
      if (imgH <= pdfH) {
        // Fits in one page
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, imgH)
      } else {
        // Multi-page
        let position = 0
        while (position < canvas.height) {
          const sliceH = Math.min(canvas.height - position, Math.round(canvas.width * pdfH / pdfW))
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = sliceH
          const ctx = pageCanvas.getContext('2d')!
          ctx.drawImage(canvas, 0, position, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
          if (position > 0) pdf.addPage()
          pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, pdfH)
          position += sliceH
        }
      }
      const clientSlug = (proposal.client_name ?? 'propuesta').replace(/\s+/g, '_')
      const dateSlug   = new Date().toISOString().slice(0, 10)
      pdf.save(`Propuesta_${clientSlug}_${dateSlug}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const total    = proposal.total_amount ?? 0
  const currency = proposal.currency ?? 'USD'
  const st       = STATUS_MAP[proposal.status] ?? STATUS_MAP.draft

  const patchProposal = useCallback(async (updates: Partial<Proposal>) => {
    setProposal(p => ({ ...p, ...updates }))
    await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }, [proposal.id])

  const changeStatus = async (status: string) => {
    setSavingStatus(true)
    setStatusMenu(false)
    await patchProposal({ status })
    setSavingStatus(false)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/propuestas" className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2D3F52] truncate">{proposal.title ?? 'Sin título'}</p>
              <p className="text-[10px] text-gray-400 truncate">
                {proposal.client_name ?? 'Sin cliente'} · {currency} {total.toLocaleString('en-US')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status selector */}
            <div className="relative">
              <button
                onClick={() => setStatusMenu(v => !v)}
                disabled={savingStatus}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${st.bg} ${st.color} border-current/20`}
              >
                {savingStatus
                  ? <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  : <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                }
                {st.label}
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {statusMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 min-w-[140px]">
                  {Object.entries(STATUS_MAP).map(([key, s]) => (
                    <button
                      key={key}
                      onClick={() => changeStatus(key)}
                      className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-gray-50 ${proposal.status === key ? 'bg-gray-50' : ''} ${s.color}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowPDF(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors"
              style={{ backgroundColor: '#1B2E3C' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0f1e2a')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1B2E3C')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Generar PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">

          {/* ── Left: composer ── */}
          <div className="space-y-6">

            {/* Header info */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Cliente</p>
                  <ClientSearch
                    value={proposal.client_name}
                    onSelect={(id, name) => patchProposal({ client_id: id, client_name: name })}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Asesor</p>
                  <EditCell
                    value={proposal.advisor_name}
                    onChange={v => patchProposal({ advisor_name: v.trim() || null })}
                    placeholder="Agregar asesor"
                    className="text-sm font-medium text-gray-800"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Monto</p>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-[#2D3F52]">{currency}</span>
                    <EditCell
                      value={proposal.total_amount}
                      onChange={v => {
                        const n = parseFloat(v.replace(/,/g, ''))
                        if (!isNaN(n) && n > 0) patchProposal({ total_amount: n })
                      }}
                      placeholder="0"
                      numeric
                      mono
                      className="text-sm font-bold text-[#2D3F52]"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Fecha</p>
                  <p className="text-sm text-gray-600">{new Date(proposal.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
              </div>
            </div>

            {/* Funds */}
            <FundsTable
              proposalId={proposal.id}
              total={total}
              currency={currency}
              funds={funds}
              onUpdate={setFunds}
            />

            {/* Bonds */}
            <BondsTable
              proposalId={proposal.id}
              total={total}
              currency={currency}
              bonds={bonds}
              onUpdate={setBonds}
            />

            {/* Equities */}
            <EquitiesTable
              proposalId={proposal.id}
              total={total}
              currency={currency}
              equities={equities}
              onUpdate={setEquities}
            />

            {/* Notes */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 mb-2">Notas internas</p>
              <textarea
                rows={3}
                defaultValue={proposal.notes ?? ''}
                onBlur={e => patchProposal({ notes: e.target.value })}
                placeholder="Comentarios, instrucciones, contexto del cliente..."
                className="w-full text-sm text-gray-700 resize-none focus:outline-none placeholder-gray-300"
              />
            </div>
          </div>

          {/* ── Right: allocation panel ── */}
          <AllocationPanel
            total={total}
            currency={currency}
            funds={funds}
            bonds={bonds}
            equities={equities}
          />
        </div>
      </div>

      {/* Click outside to close status menu */}
      {statusMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setStatusMenu(false)} />
      )}

      {/* ── PDF Preview Modal ── */}
      {showPDF && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden" style={{ maxWidth: 1120, maxHeight: '95vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B2E3C' }}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Vista previa de la propuesta</p>
                  <p className="text-[10px] text-gray-400">{proposal.client_name ?? 'Sin cliente'} · {proposal.currency} {proposal.total_amount.toLocaleString('en-US')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#16A34A' }}
                >
                  {downloading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Generando...</>
                    : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Descargar PDF</>
                  }
                </button>
                <button onClick={() => setShowPDF(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-lg leading-none">×</button>
              </div>
            </div>

            {/* PDF content — scrollable */}
            <div className="flex-1 overflow-auto bg-gray-100 p-6">
              {/* Shadow box simulating paper */}
              <div className="mx-auto shadow-2xl" style={{ width: 1050 }}>
                <div ref={pdfRef}>
                  <ProposalPDFTemplate
                    clientName={proposal.client_name}
                    advisorName={proposal.advisor_name}
                    totalAmount={proposal.total_amount}
                    currency={proposal.currency}
                    funds={funds}
                    bonds={bonds}
                    equities={equities}
                    disclaimer={proposal.disclaimer}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
