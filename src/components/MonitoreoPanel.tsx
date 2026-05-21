'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { SessionUser } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BaseAccount {
  id: string
  account_number: string
  account_name: string | null
  client_code: string | null
  risk_level: string | null
  activity_profile: number | null
  risk_tolerance: string | null
  comments: string | null
  is_active: boolean
  needs_review: boolean
}

// Risk → Tolerance mapping
const RISK_TOLERANCE: Record<string, string> = {
  BAJO:  '40%',
  MEDIO: '20%',
  ALTO:  '0%',
}

interface MonitoringRun {
  id: string
  period_year: number
  period_quarter: number
  original_file_name: string | null
  created_by: string
  created_at: string
  total_accounts: number
  accounts_with_deviation: number
  accounts_without_deviation: number
  new_accounts_detected: number
  status: string
}

interface MonitoringRecord {
  id: string
  monitoring_run_id: string
  account_number: string | null
  account_name: string | null
  client_code: string | null
  risk_level: string | null
  activity_profile: number | null       // Monto esperado (PERFIL DE ACTIVIDAD)
  risk_tolerance: string | null         // "40%", "20%"
  activity_risk_profile: number | null  // Perfil × (1 + Tolerancia) = límite superior
  net_worth: number | null              // AUM real
  deviation_percent: number | null      // % de desvío sobre el límite
  monitoring_status: string | null      // 'OK', 'DESVIO', 'SIN AUM'
  explanation: string | null
  is_new_account: boolean
}

const PERIOD_LABELS: Record<number, string> = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' }
const PERIOD_MONTHS: Record<number, string> = { 1: 'Ene–Mar', 2: 'Abr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dic' }

function periodLabel(run: MonitoringRun) {
  return `${PERIOD_LABELS[run.period_quarter]} ${run.period_year}`
}

function hasDeviation(r: MonitoringRecord): boolean {
  if (r.monitoring_status === 'DESVIO') return true
  if (r.deviation_percent !== null && r.deviation_percent > 0) return true
  return false
}

const fmt = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`

// ─── Column mapping ───────────────────────────────────────────────────────────

const MAPPING_FIELDS = [
  { key: 'account_number',        label: 'Número de cuenta',               hint: 'Ej: ROJ002054',         required: true  },
  { key: 'account_name',          label: 'Nombre de cuenta',               hint: 'Ej: GATTIALBER',        required: false },
  { key: 'client_code',           label: 'Código de cliente',              hint: 'Ej: 7683107',           required: false },
  { key: 'risk_level',            label: 'Riesgo (RIESGO)',                hint: 'BAJO / MEDIO / ALTO',   required: false },
  { key: 'activity_profile',      label: 'Perfil de actividad (monto)',    hint: 'Ej: 275000',            required: false },
  { key: 'risk_tolerance',        label: 'Tolerancia al riesgo',           hint: 'Ej: 40%',               required: false },
  { key: 'activity_risk_profile', label: 'Perfil + tolerancia (calculado)',hint: 'Se calcula automático', required: false },
  { key: 'net_worth',             label: 'AUM real (columna con fecha)',   hint: 'Ej: AUM - 1/12/2023',   required: false },
  { key: 'deviation_percent',     label: 'DESVIO (si ya está calculado)',  hint: 'Dejar vacío = auto',    required: false },
  { key: 'monitoring_status',     label: 'Estado (si ya está en Excel)',   hint: 'Dejar vacío = auto',    required: false },
  { key: 'explanation',           label: 'Explicaciones',                  hint: 'Observaciones',         required: false },
] as const

type MappingKey = typeof MAPPING_FIELDS[number]['key']

// ─── Auto-detect column names ────────────────────────────────────────────────

function autoDetectMapping(headers: string[]): Partial<Record<MappingKey, string>> {
  const m: Partial<Record<MappingKey, string>> = {}
  const find = (keywords: string[]) =>
    headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k)))

  m.account_number        = find(['numero de cuenta', 'número de cuenta', 'nro cuenta', 'numero cuenta', 'n° cuenta', 'account number'])
  m.account_name          = find(['name - short name', 'short name', 'nombre de cuenta', 'nombre cuenta', 'account name', 'razón social'])
  m.client_code           = find(['código de cliente', 'codigo de cliente', 'cod cliente', 'código cliente', 'client code'])
  m.risk_level            = find(['riesgo'])
  m.activity_profile      = find(['perfil de actividad', 'perfil actividad'])
  // Skip activity_risk_profile — it will be computed automatically
  m.net_worth             = find(['aum'])  // Catches "AUM - 1/12/2023", "AUM 2023", etc.
  m.risk_tolerance        = find(['tolerancia'])
  m.deviation_percent     = find(['desvio', 'desvío', 'deviation'])
  m.monitoring_status     = find(['estado', 'status', 'resultado'])
  m.explanation           = find(['explicacion', 'explicación', 'observacion', 'observación', 'detalle', 'notas'])

  // Remove undefined
  Object.keys(m).forEach((k) => { if (!m[k as MappingKey]) delete m[k as MappingKey] })
  return m
}

// ─── Parse tolerance string to decimal ───────────────────────────────────────

function parseTolerance(val: string): number | null {
  const s = String(val).replace('%', '').trim()
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return n > 1 ? n / 100 : n  // "40" → 0.40, "0.4" → 0.40
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonitoreoPanel({ user, entity }: { user: SessionUser; entity: 'roble' | 'geliene' }) {
  const [activeView, setActiveView] = useState<'latest' | 'historial' | 'cuentas'>('latest')
  const [runs, setRuns] = useState<MonitoringRun[]>([])
  const [latestRecords, setLatestRecords] = useState<MonitoringRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [viewingRun, setViewingRun] = useState<MonitoringRun | null>(null)
  const [viewingRecords, setViewingRecords] = useState<MonitoringRecord[]>([])
  const [loadingView, setLoadingView] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'deviation' | 'new' | 'sin_aum'>('all')
  const [searchText, setSearchText] = useState('')
  const [baseAccountsList, setBaseAccountsList] = useState<BaseAccount[]>([])
  const [loadingBase, setLoadingBase] = useState(false)

  const latestRun = runs[0] ?? null

  const fetchRuns = useCallback(async () => {
    const res = await fetch(`/api/monitoring?entity=${entity}`)
    if (res.ok) setRuns(await res.json())
    setLoading(false)
  }, [entity])

  const fetchLatestRecords = useCallback(async (runId: string) => {
    setLoadingRecords(true)
    const res = await fetch(`/api/monitoring/${runId}/records`)
    if (res.ok) setLatestRecords(await res.json())
    setLoadingRecords(false)
  }, [])

  const fetchBaseAccounts = useCallback(async () => {
    setLoadingBase(true)
    const res = await fetch(`/api/monitoring/accounts?entity=${entity}`)
    if (res.ok) setBaseAccountsList(await res.json())
    setLoadingBase(false)
  }, [entity])

  useEffect(() => { fetchRuns() }, [fetchRuns])
  useEffect(() => {
    if (latestRun) fetchLatestRecords(latestRun.id)
  }, [latestRun?.id, fetchLatestRecords])
  useEffect(() => {
    if (activeView === 'cuentas') fetchBaseAccounts()
  }, [activeView, fetchBaseAccounts])

  async function openRun(run: MonitoringRun) {
    setViewingRun(run)
    setLoadingView(true)
    const res = await fetch(`/api/monitoring/${run.id}/records`)
    if (res.ok) setViewingRecords(await res.json())
    setLoadingView(false)
  }

  async function deleteRun(run: MonitoringRun) {
    if (!confirm(`¿Eliminar el monitoreo ${periodLabel(run)}? Esta acción no se puede deshacer.`)) return
    const res = await fetch(`/api/monitoring/${run.id}`, { method: 'DELETE' })
    if (res.ok) {
      setRuns((prev) => prev.filter((r) => r.id !== run.id))
      if (latestRun?.id === run.id) setLatestRecords([])
    }
  }

  function download(runId: string, fmt: 'xlsx' | 'csv') {
    window.open(`/api/monitoring/${runId}/download?format=${fmt}`, '_blank')
  }

  const sourceRecords = viewingRun ? viewingRecords : latestRecords

  const displayRecords = sourceRecords.filter((r) => {
    if (filterStatus === 'deviation' && !hasDeviation(r)) return false
    if (filterStatus === 'new' && !r.is_new_account) return false
    if (filterStatus === 'sin_aum' && r.monitoring_status !== 'SIN AUM') return false
    if (searchText) {
      const q = searchText.toLowerCase()
      return (
        r.account_name?.toLowerCase().includes(q) ||
        r.account_number?.toLowerCase().includes(q) ||
        r.client_code?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const sinAum = sourceRecords.filter((r) => r.monitoring_status === 'SIN AUM').length
  const displayRun = viewingRun ?? latestRun

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header bar ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-[#2D3F52]">Monitoreo de cuentas</h2>
          <p className="text-xs text-gray-400 mt-0.5">Control trimestral · Desvíos vs perfil de actividad</p>
        </div>
        <div className="flex items-center gap-2">
          {displayRun && (
            <div className="flex items-center gap-1">
              <button onClick={() => download(displayRun.id, 'xlsx')} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Excel
              </button>
              <button onClick={() => download(displayRun.id, 'csv')} className="px-3 py-1.5 border border-gray-200 bg-white text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">
                CSV
              </button>
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#2D3F52] text-white text-xs font-medium rounded-lg hover:bg-[#354A5E] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Crear monitoreo
          </button>
        </div>
      </div>

      {/* Sub-tabs — always visible */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => { setActiveView('latest'); setViewingRun(null) }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeView === 'latest' ? 'border-[#16A34A] text-[#2D3F52]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {latestRun ? `${periodLabel(latestRun)} · Actual` : 'Actual'}
        </button>
        <button
          onClick={() => setActiveView('historial')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeView === 'historial' ? 'border-[#16A34A] text-[#2D3F52]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Historial <span className="ml-1 text-[10px] font-normal text-gray-400">({runs.length})</span>
        </button>
        <button
          onClick={() => setActiveView('cuentas')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeView === 'cuentas' ? 'border-[#16A34A] text-[#2D3F52]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Cuentas base
          {baseAccountsList.filter(a => a.needs_review).length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-amber-500 text-white rounded-full">
              {baseAccountsList.filter(a => a.needs_review).length}
            </span>
          )}
        </button>
      </div>

      {/* Actual / Historial — solo si hay runs */}
      {runs.length === 0 && (activeView === 'latest' || activeView === 'historial') ? (
        <EmptyMonitoreo onCreateClick={() => setShowCreate(true)} />
      ) : (
        <>

          {/* Historial */}
          {activeView === 'historial' && !viewingRun && (
            <HistorialView runs={runs} onView={openRun} onDownload={download} onDelete={deleteRun} isAdmin={user.role === 'admin'} />
          )}

          {/* Viewing a run from historial */}
          {activeView === 'historial' && viewingRun && (
            <>
              <button onClick={() => setViewingRun(null)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Volver al historial
              </button>
              {loadingView ? (
                <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin" /></div>
              ) : (
                <MonitoreoTable
                  run={viewingRun} records={sourceRecords} displayRecords={displayRecords}
                  filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                  searchText={searchText} setSearchText={setSearchText} sinAum={sinAum}
                  onResolveAccount={(num) => setViewingRecords(prev => prev.map(r => r.account_number === num ? { ...r, is_new_account: false } : r))}
                  onUpdateRecord={(id, expl) => setViewingRecords(prev => prev.map(r => r.id === id ? { ...r, explanation: expl } : r))}
                  onRemoveRecord={(id) => setViewingRecords(prev => prev.filter(r => r.id !== id))}
                  entity={entity}
                />
              )}
            </>
          )}

          {/* Cuentas base */}
          {activeView === 'cuentas' && (
            loadingBase ? (
              <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin" /></div>
            ) : (
              <BaseAccountsView
                accounts={baseAccountsList}
                isAdmin={user.role === 'admin'}
                onUpdate={(updated) => setBaseAccountsList(prev => prev.map(a => a.id === updated.id ? updated : a))}
                onDelete={(id) => setBaseAccountsList(prev => prev.filter(a => a.id !== id))}
              />
            )
          )}

          {/* Latest run */}
          {activeView === 'latest' && latestRun && (
            loadingRecords ? (
              <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-gray-200 border-t-[#2D3F52] rounded-full animate-spin" /></div>
            ) : (
              <MonitoreoTable
                run={latestRun} records={latestRecords} displayRecords={displayRecords}
                filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                searchText={searchText} setSearchText={setSearchText} sinAum={sinAum}
                onResolveAccount={(num) => setLatestRecords(prev => prev.map(r => r.account_number === num ? { ...r, is_new_account: false } : r))}
                onUpdateRecord={(id, expl) => setLatestRecords(prev => prev.map(r => r.id === id ? { ...r, explanation: expl } : r))}
                onRemoveRecord={(id) => setLatestRecords(prev => prev.filter(r => r.id !== id))}
                entity={entity}
              />
            )
          )}
        </>
      )}

      {showCreate && (
        <CreateMonitoreoModal
          user={user}
          entity={entity}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await fetchRuns()
            setActiveView('latest')
            setViewingRun(null)
          }}
        />
      )}
    </div>
  )
}

// ─── MonitoreoTable ───────────────────────────────────────────────────────────

function MonitoreoTable({
  run, records, displayRecords, filterStatus, setFilterStatus, searchText, setSearchText, sinAum, onResolveAccount, onUpdateRecord, onRemoveRecord, entity,
}: {
  run: MonitoringRun
  records: MonitoringRecord[]
  displayRecords: MonitoringRecord[]
  filterStatus: 'all' | 'deviation' | 'new' | 'sin_aum'
  setFilterStatus: (v: 'all' | 'deviation' | 'new' | 'sin_aum') => void
  searchText: string
  setSearchText: (v: string) => void
  sinAum: number
  onResolveAccount: (accountNumber: string) => void
  onUpdateRecord: (id: string, explanation: string | null) => void
  onRemoveRecord: (id: string) => void
  entity: string
}) {
  const [addingToBase, setAddingToBase] = useState<string | null>(null)
  const [closingAccount, setClosingAccount] = useState<string | null>(null)

  async function closeAccount(r: MonitoringRecord) {
    const label = r.account_name ?? r.account_number ?? r.id
    if (!confirm(`¿Cerrar "${label}"? Se eliminará de este monitoreo y no aparecerá en futuros.`)) return
    setClosingAccount(r.account_number ?? r.id)
    try {
      // 1. Mark base account inactive (by account_number or account_name)
      if (r.account_number || r.account_name) {
        await fetch('/api/monitoring/accounts/close', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_number: r.account_number, account_name: r.account_name, entity }),
        })
      }
      // 2. Delete this record from the run permanently
      await fetch(`/api/monitoring/records/${r.id}`, { method: 'DELETE' })
      // 3. Remove from local state immediately
      onRemoveRecord(r.id)
    } finally {
      setClosingAccount(null)
    }
  }
  const [editingExpl, setEditingExpl] = useState<string | null>(null)   // record id
  const [explValue, setExplValue] = useState('')
  const [savingExpl, setSavingExpl] = useState(false)

  function startEditExpl(r: MonitoringRecord) {
    setEditingExpl(r.id)
    setExplValue(r.explanation ?? '')
  }

  async function saveExpl(r: MonitoringRecord) {
    if (savingExpl) return
    setSavingExpl(true)
    try {
      const res = await fetch(`/api/monitoring/records/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explanation: explValue || null }),
      })
      if (res.ok) onUpdateRecord(r.id, explValue || null)
    } finally {
      setSavingExpl(false)
      setEditingExpl(null)
    }
  }

  async function addToBase(r: MonitoringRecord, closed = false) {
    if (!r.account_number) return
    setAddingToBase(r.account_number)
    try {
      // 1. Upsert to base table
      await fetch('/api/monitoring/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity,
          accounts: [{
            account_number:   r.account_number,
            account_name:     r.account_name  ?? null,
            client_code:      r.client_code   ?? null,
            risk_level:       null,
            activity_profile: null,
            risk_tolerance:   null,
            comments:         closed ? 'Cuenta cerrada' : null,
            is_active:        !closed,
            needs_review:     !closed,
          }],
        }),
      })
      // 2. Mark as resolved in all monitoring_records (persists across views)
      await fetch('/api/monitoring/resolve-account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_number: r.account_number }),
      })
      // 3. Update local state immediately
      onResolveAccount(r.account_number)
    } finally {
      setAddingToBase(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Período" value={periodLabel(run)} subtitle={PERIOD_MONTHS[run.period_quarter]} />
        <StatCard label="Creado" value={format(new Date(run.created_at), 'd MMM yyyy', { locale: es })} subtitle={`por ${run.created_by}`} />
        <StatCard label="Cuentas analizadas" value={run.total_accounts} />
        <StatCard label="Con desvío" value={run.accounts_with_deviation} accent={run.accounts_with_deviation > 0 ? 'red' : 'green'} />
        <StatCard label="Cuentas nuevas" value={run.new_accounts_detected} accent={run.new_accounts_detected > 0 ? 'amber' : 'neutral'} />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: 'all',       label: `Todos (${records.length})`,                        color: 'default' },
            { key: 'deviation', label: `Con desvío (${records.filter(hasDeviation).length})`,      color: 'red'     },
            { key: 'new',       label: `Cuentas nuevas (${run.new_accounts_detected})`,    color: 'amber'   },
            ...(sinAum > 0 ? [{ key: 'sin_aum', label: `Sin AUM (${sinAum})`, color: 'gray' }] : []),
          ] as const).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key as any)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filterStatus === key
                  ? color === 'red' ? 'bg-red-100 text-red-700'
                    : color === 'amber' ? 'bg-amber-100 text-amber-700'
                    : color === 'gray' ? 'bg-gray-200 text-gray-600'
                    : 'bg-[#2D3F52] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Buscar cuenta, número, código..."
          className="flex-1 min-w-[200px] text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20"
        />
        <span className="text-[11px] text-gray-400 shrink-0">{displayRecords.length} resultado{displayRecords.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cuenta</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cód. cliente</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Riesgo</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Perfil act.</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tolerancia</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Límite</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AUM real</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Desvío</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Explicación</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayRecords.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-xs text-gray-400">Sin registros para este filtro.</td></tr>
              ) : (() => {
                const known = displayRecords.filter(r => !r.is_new_account)
                const newOnes = displayRecords.filter(r => r.is_new_account)
                const allRows = [...known, ...newOnes]
                return allRows.map((r, idx) => {
                const dev = hasDeviation(r)
                const noAum = r.monitoring_status === 'SIN AUM'
                const isFirstNew = r.is_new_account && (idx === 0 || !allRows[idx - 1].is_new_account)
                return (
                  <>
                    {isFirstNew && newOnes.length > 0 && (
                      <tr key={`sep-${r.id}`}>
                        <td colSpan={11} className="px-4 py-2 bg-indigo-50 border-y border-indigo-100">
                          <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">
                            ↓ Cuentas nuevas — no figuran en tabla base ({newOnes.length})
                          </span>
                        </td>
                      </tr>
                    )}
                  <tr key={r.id} className={`transition-colors ${r.is_new_account ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : dev ? 'bg-red-50/15 hover:bg-red-50/25' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-4 py-2.5">
                      <p className={`font-medium truncate max-w-[160px] ${r.is_new_account ? 'text-indigo-700' : dev ? 'text-red-700' : 'text-gray-800'}`}>
                        {r.account_name ?? <span className="text-gray-400 italic">Sin nombre</span>}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono">{r.account_number ?? '—'}</p>
                      {r.is_new_account && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded tracking-wide">SIN BASE</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono">{r.client_code ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.risk_level ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          r.risk_level === 'ALTO' ? 'bg-red-100 text-red-700'
                          : r.risk_level === 'MEDIO' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {r.risk_level}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">
                      {r.activity_profile !== null ? fmt.format(r.activity_profile) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{r.risk_tolerance ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {r.activity_risk_profile !== null ? fmt.format(r.activity_risk_profile) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {noAum ? (
                        <span className="text-gray-400 italic">—</span>
                      ) : r.net_worth !== null ? (
                        <span className={dev ? 'text-red-600 font-semibold' : 'text-gray-700'}>{fmt.format(r.net_worth)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.deviation_percent !== null && r.deviation_percent !== 0 ? (
                        <span className={`font-bold ${r.deviation_percent > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtPct(r.deviation_percent)}
                        </span>
                      ) : r.deviation_percent === 0 ? (
                        <span className="text-emerald-600">0.0%</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        r.monitoring_status === 'DESVIO' ? 'bg-red-50 text-red-700'
                        : r.monitoring_status === 'OK' ? 'bg-emerald-50 text-emerald-700'
                        : r.monitoring_status === 'SIN AUM' ? 'bg-gray-100 text-gray-500'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                        {r.monitoring_status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[240px]">
                      {r.is_new_account ? (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => addToBase(r, false)}
                            disabled={addingToBase === r.account_number}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
                          >
                            {addingToBase === r.account_number
                              ? <div className="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin" />
                              : <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            }
                            Agregar a tabla base
                          </button>
                        </div>
                      ) : editingExpl === r.id ? (
                        <div className="flex flex-col gap-1">
                          <textarea
                            autoFocus
                            value={explValue}
                            onChange={(e) => setExplValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveExpl(r) } if (e.key === 'Escape') setEditingExpl(null) }}
                            rows={2}
                            className="w-full text-[11px] border border-[#16A34A]/60 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                            placeholder="Escribí la explicación..."
                          />
                          <div className="flex gap-1">
                            <button onClick={() => saveExpl(r)} disabled={savingExpl} className="px-2 py-0.5 text-[10px] bg-[#2D3F52] text-white rounded hover:bg-[#354A5E] disabled:opacity-60">
                              {savingExpl ? '...' : 'Guardar'}
                            </button>
                            <button onClick={() => setEditingExpl(null)} className="px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditExpl(r)}
                          className="group cursor-pointer flex items-start gap-1 min-h-[20px]"
                          title="Clic para editar explicación"
                        >
                          <p className="truncate text-gray-500 text-[11px] flex-1">{r.explanation || <span className="text-gray-300 italic">Agregar explicación...</span>}</p>
                          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    {/* Cerrar cuenta — columna separada al final */}
                    <td className="px-3 py-2.5 text-right">
                      {!r.is_new_account && (
                        <button
                          onClick={() => closeAccount(r)}
                          disabled={closingAccount === (r.account_number ?? r.id)}
                          title="Cerrar cuenta"
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {closingAccount === (r.account_number ?? r.id)
                            ? <div className="w-2.5 h-2.5 border border-red-300 border-t-red-600 rounded-full animate-spin" />
                            : <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          }
                          Cerrar
                        </button>
                      )}
                      {r.is_new_account && (
                        <button
                          onClick={() => addToBase(r, true)}
                          disabled={addingToBase === r.account_number}
                          title="Marcar como cuenta cerrada"
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          Cerrar
                        </button>
                      )}
                    </td>
                  </tr>
                  </>
                )
              })})()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── HistorialView ────────────────────────────────────────────────────────────

function HistorialView({ runs, onView, onDownload, onDelete, isAdmin }: {
  runs: MonitoringRun[]
  onView: (r: MonitoringRun) => void
  onDownload: (id: string, fmt: 'xlsx' | 'csv') => void
  onDelete: (r: MonitoringRun) => void
  isAdmin: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {['Período','Fecha de creación','Archivo original','Cuentas','Con desvío','Sin desvío','Nuevas','Creado por',''].map((h) => (
              <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${h === '' ? '' : 'text-left'} ${['Cuentas','Con desvío','Sin desvío','Nuevas'].includes(h) ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {runs.map((run, i) => (
            <tr key={run.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#2D3F52]">{periodLabel(run)}</span>
                  {i === 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#2D3F52]/8 text-[#2D3F52] rounded">ACTUAL</span>}
                </div>
                <p className="text-[10px] text-gray-400">{PERIOD_MONTHS[run.period_quarter]}</p>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(run.created_at), 'd MMM yyyy HH:mm', { locale: es })}</td>
              <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px]">
                <span className="truncate block" title={run.original_file_name ?? ''}>{run.original_file_name ?? '—'}</span>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-700">{run.total_accounts}</td>
              <td className="px-4 py-3 text-right">
                <span className={`font-semibold ${run.accounts_with_deviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{run.accounts_with_deviation}</span>
              </td>
              <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{run.accounts_without_deviation}</td>
              <td className="px-4 py-3 text-right">
                <span className={run.new_accounts_detected > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}>{run.new_accounts_detected}</span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">{run.created_by}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={() => onView(run)} className="px-2.5 py-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium">Ver</button>
                  <button onClick={() => onDownload(run.id, 'xlsx')} className="p-1.5 text-gray-400 hover:text-[#2D3F52] hover:bg-gray-100 rounded transition-colors" title="Excel">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={() => onDownload(run.id, 'csv')} className="p-1.5 text-gray-400 hover:text-[#2D3F52] hover:bg-gray-100 rounded transition-colors text-[10px] font-bold" title="CSV">CSV</button>
                  {isAdmin && (
                    <button onClick={() => onDelete(run)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── CreateMonitoreoModal ─────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_QUARTER = Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4

function CreateMonitoreoModal({ user, entity, onClose, onCreated }: {
  user: SessionUser
  entity: 'roble' | 'geliene'
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(CURRENT_QUARTER)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<(string | number | null)[][]>([])
  const [allRows, setAllRows] = useState<(string | number | null)[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<MappingKey, string>>>({})
  const [processing, setProcessing] = useState(false)
  const [preview, setPreview] = useState<{ total: number; withDev: number; newAcc: number; sinAum: number; matched: number } | null>(null)
  const [error, setError] = useState('')
  const [bcuAccountNumbers, setBcuAccountNumbers] = useState<Set<string>>(new Set())
  const [baseAccounts, setBaseAccounts] = useState<BaseAccount[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/banco-central')
      .then((r) => r.json())
      .then((data) => {
        const nums = new Set<string>((data.records ?? [])
          .map((r: any) => String(r.customer_number ?? '').trim())
          .filter(Boolean))
        setBcuAccountNumbers(nums)
      })
      .catch(() => {})

    fetch(`/api/monitoring/accounts?entity=${entity}`)
      .then((r) => r.json())
      .then((data: BaseAccount[]) => setBaseAccounts(data ?? []))
      .catch(() => {})
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    try {
      const XLSX = await import('xlsx')
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null })
      if (raw.length < 2) { setError('El archivo parece estar vacío.'); return }

      const hdrs = (raw[0] as (string | number | null)[]).map((h) => String(h ?? ''))
      const dataRows = raw.slice(1) as (string | number | null)[][]
      setHeaders(hdrs)
      setPreviewRows(raw.slice(1, 6) as (string | number | null)[][])
      setAllRows(dataRows)
      setMapping({})   // reset — user will pick the 3 columns in step 3
      setStep(3)
    } catch {
      setError('No se pudo leer el archivo. Asegurate de que sea un Excel válido (.xlsx).')
    }
  }

  function buildRecords(
    _allRows = allRows,
    _headers = headers,
    _mapping = mapping,
  ) {
    // Build lookup maps from base accounts
    const baseByNumber = new Map<string, BaseAccount>()
    const baseByName = new Map<string, BaseAccount>()
    for (const ba of baseAccounts) {
      if (ba.account_number) baseByNumber.set(ba.account_number.trim().toUpperCase(), ba)
      if (ba.account_name) baseByName.set(ba.account_name.trim().toUpperCase(), ba)
    }

    return _allRows.map((row) => {
      const get = (key: MappingKey): string => {
        const col = _mapping[key]
        if (!col) return ''
        const i = _headers.indexOf(col)
        if (i < 0) return ''
        return String(row[i] ?? '').trim()
      }
      const getNum = (key: MappingKey): number | null => {
        const v = get(key)
        if (!v) return null
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
        return isNaN(n) ? null : n
      }

      const accountNumber = get('account_number')
      const accountNameRaw = get('account_name')

      // ── Match against base accounts (number first, then name) ──
      const base =
        baseByNumber.get(accountNumber.toUpperCase()) ??
        baseByName.get(accountNameRaw.toUpperCase()) ??
        null

      // Use base data when available, fall back to Excel columns
      const profile       = base?.activity_profile     ?? getNum('activity_profile')
      const riskLevel     = base?.risk_level            ?? get('risk_level')
      // Always derive tolerance from RISK_TOLERANCE map when risk_level is known
      const toleranceStr  = (riskLevel ? RISK_TOLERANCE[riskLevel.toUpperCase()] : null)
                            ?? base?.risk_tolerance
                            ?? get('risk_tolerance')
      const accountName   = (base?.account_name ?? accountNameRaw) || null
      const clientCode    = base?.client_code           ?? get('client_code')

      const tolerance = toleranceStr ? parseTolerance(toleranceStr) : null
      const aum = getNum('net_worth')

      // Compute upper limit: profile × (1 + tolerance)
      const upperLimit =
        profile !== null && tolerance !== null
          ? profile * (1 + tolerance)
          : null

      // Compute deviation and status
      let deviationPct: number | null = null
      let monitoringStatus: string | null = null

      if (aum !== null && upperLimit !== null) {
        deviationPct = parseFloat(((aum / upperLimit - 1) * 100).toFixed(2))
        monitoringStatus = aum > upperLimit ? 'DESVIO' : 'OK'
      } else if (aum === null && profile !== null) {
        monitoringStatus = 'SIN AUM'
      }

      // Override with explicit values from Excel if mapped
      const explicitDev = getNum('deviation_percent')
      if (explicitDev !== null) deviationPct = explicitDev

      const explicitStatus = get('monitoring_status')
      if (explicitStatus) monitoringStatus = explicitStatus

      // "New" = not found in base accounts table
      const isNew = base === null

      return {
        account_number:        accountNumber || (base?.account_number ?? null),
        account_name:          accountName,
        client_code:           clientCode || null,
        risk_level:            riskLevel || null,
        activity_profile:      profile,
        risk_tolerance:        toleranceStr || null,
        activity_risk_profile: upperLimit,
        net_worth:             aum,
        deviation_percent:     deviationPct,
        monitoring_status:     monitoringStatus,
        explanation:           get('explanation') || null,
        is_new_account:        isNew,
        matched_base:          base !== null,
      }
    }).filter((r) => r.account_number || r.account_name)
  }

  function handlePreview() {
    if (!mapping.account_number) { setError('Asigná al menos la columna "Número de cuenta".'); return }
    setError('')
    const records = buildRecords()
    const withDev = records.filter((r) => r.monitoring_status === 'DESVIO').length
    const newAcc = records.filter((r) => r.is_new_account).length
    const sinAum = records.filter((r) => r.monitoring_status === 'SIN AUM').length
    const matched = records.filter((r) => (r as any).matched_base).length
    setPreview({ total: records.length, withDev, newAcc, sinAum, matched })
    setStep(4)
  }

  async function handleCreate() {
    setProcessing(true)
    setError('')
    try {
      const records = buildRecords()

      // Create the monitoring run
      const res = await fetch('/api/monitoring/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_year: year, period_quarter: quarter, original_file_name: fileName, records, entity }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear monitoreo'); return }

      // Auto-create unmatched accounts in base table (needs_review = true)
      const unmatched = records.filter((r) => !(r as any).matched_base && r.account_number)
      if (unmatched.length > 0) {
        const newAccounts = unmatched.map((r) => ({
          account_number: r.account_number,
          account_name: r.account_name ?? null,
          client_code: r.client_code ?? null,
          risk_level: null,
          activity_profile: null,
          risk_tolerance: null,
          comments: null,
          is_active: true,
          needs_review: true,
        }))
        await fetch('/api/monitoring/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity, accounts: newAccounts }),
        })
      }

      onCreated()
    } catch {
      setError('Error inesperado')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Nuevo monitoreo — {entity === 'roble' ? 'Roble Capital' : 'Geliene'}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {step === 1 ? 'Paso 1 — Elegir período'
               : step === 2 ? 'Paso 2 — Subir archivo Excel'
               : step === 3 ? 'Paso 3 — Identificar columnas'
               : 'Paso 4 — Confirmar y procesar'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {[1,2,3,4].map((s) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-colors ${s <= step ? 'bg-[#2D3F52]' : 'bg-gray-200'}`} />
              ))}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Period */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">Seleccioná el período al que corresponde este monitoreo.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Año</label>
                  <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} min={2020} max={2040}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#16A34A]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Trimestre</label>
                  <div className="grid grid-cols-4 gap-2">
                    {([1, 2, 3, 4] as const).map((q) => (
                      <button key={q} onClick={() => setQuarter(q)}
                        className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${quarter === q ? 'bg-[#2D3F52] text-white border-[#2D3F52]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        Q{q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs text-gray-500">Período seleccionado</p>
                <p className="text-lg font-semibold text-[#2D3F52] mt-0.5">Q{quarter} {year} — {PERIOD_MONTHS[quarter]}</p>
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Subí el Excel del banco con los datos de monitoreo (formato como la planilla de ejemplo).</p>
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#16A34A] hover:bg-[#16A34A]/5 transition-colors group">
                <svg className="w-10 h-10 text-gray-300 group-hover:text-[#16A34A] mx-auto mb-3 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium text-gray-700">Hacer clic para seleccionar archivo</p>
                <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls)</p>
                {fileName && <p className="text-xs text-[#2D3F52] font-semibold mt-2">{fileName}</p>}
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
              {error && <ErrorMsg msg={error} />}
            </div>
          )}

          {/* Step 3: Column mapping (3 required columns only) */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Indicá qué columna del Excel corresponde a cada campo.
              </p>
              {([
                { key: 'account_number' as MappingKey, label: 'Número de cuenta', required: true  },
                { key: 'account_name'   as MappingKey, label: 'Nombre de cuenta', required: true  },
                { key: 'net_worth'      as MappingKey, label: 'AUM real',          required: true  },
              ]).map(({ key, label, required }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {label} {required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={mapping[key] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value || undefined }))}
                    className={`w-full text-sm border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#16A34A] bg-white ${mapping[key] ? 'border-[#16A34A] bg-[#16A34A]/5' : 'border-gray-200'}`}
                  >
                    <option value="">— Seleccionar columna —</option>
                    {headers.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              {error && <ErrorMsg msg={error} />}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && preview && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Revisá el resumen antes de guardar el monitoreo <strong className="text-[#2D3F52]">Q{quarter} {year}</strong>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Cuentas analizadas',        value: preview.total,   color: 'neutral' },
                  { label: 'Matcheadas con tabla base',  value: `${preview.matched}/${preview.total}`, color: preview.matched === preview.total ? 'green' : 'amber' },
                  { label: 'Con desvío',                 value: preview.withDev, color: preview.withDev > 0 ? 'red' : 'green' },
                  { label: 'Sin AUM registrado',         value: preview.sinAum,  color: preview.sinAum > 0 ? 'amber' : 'neutral' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`border rounded-xl px-4 py-4 text-center ${
                    color === 'red' ? 'bg-red-50 border-red-100'
                    : color === 'green' ? 'bg-emerald-50 border-emerald-100'
                    : color === 'amber' ? 'bg-amber-50 border-amber-100'
                    : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-3xl font-bold ${
                      color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : 'text-[#2D3F52]'
                    }`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between"><span>Período</span><span className="font-medium text-gray-700">Q{quarter} {year} — {PERIOD_MONTHS[quarter]}</span></div>
                <div className="flex justify-between"><span>Archivo</span><span className="font-medium text-gray-700 truncate max-w-[260px]">{fileName}</span></div>
                <div className="flex justify-between"><span>Creado por</span><span className="font-medium text-gray-700">{user.name}</span></div>
                <div className="flex justify-between"><span>Cálculo desvío</span><span className="font-medium text-gray-700">AUM vs Perfil × (1 + Tolerancia)</span></div>
              </div>
              {/* Chosen columns summary */}
              <div className="border border-gray-100 rounded-xl px-4 py-3 space-y-1.5 text-xs bg-gray-50">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Columnas del Excel</p>
                {([
                  { key: 'account_number' as MappingKey, label: 'N° cuenta' },
                  { key: 'account_name'   as MappingKey, label: 'Nombre'    },
                  { key: 'net_worth'      as MappingKey, label: 'AUM'       },
                ]).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-[#2D3F52] bg-white border border-gray-200 px-2 py-0.5 rounded text-[10px]">"{mapping[key]}"</span>
                  </div>
                ))}
              </div>
              {error && <ErrorMsg msg={error} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => step === 4 ? setStep(3) : step === 3 ? setStep(2) : step === 2 ? setStep(1) : onClose()}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {step === 1 ? 'Cancelar' : '← Atrás'}
          </button>
          <div className="flex items-center gap-2">
            {step === 1 && <button onClick={() => setStep(2)} className="px-6 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors">Siguiente →</button>}
            {step === 2 && <p className="text-xs text-gray-400">Seleccioná un archivo para continuar</p>}
            {step === 3 && (
              <button
                onClick={handlePreview}
                disabled={!mapping.account_number || !mapping.account_name || !mapping.net_worth}
                className="px-6 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-40"
              >
                Ver resumen →
              </button>
            )}
            {step === 4 && (
              <button onClick={handleCreate} disabled={processing}
                className="px-6 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-60 flex items-center gap-2">
                {processing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {processing ? 'Procesando...' : 'Crear monitoreo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, subtitle, accent }: {
  label: string; value: string | number; subtitle?: string; accent?: 'red' | 'green' | 'amber' | 'neutral'
}) {
  const color = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-emerald-600' : accent === 'amber' ? 'text-amber-600' : 'text-[#2D3F52]'
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function EmptyMonitoreo({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-[#2D3F52]/8 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-[#2D3F52]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 mb-1">Sin monitoreos creados</p>
      <p className="text-xs text-gray-400 mb-5">Creá el primer monitoreo trimestral subiendo la planilla del banco.</p>
      <button onClick={onCreateClick} className="px-5 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] transition-colors">
        Crear primer monitoreo
      </button>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-xs text-red-700">{msg}</p>
    </div>
  )
}

// ─── BaseAccountsView ─────────────────────────────────────────────────────────

function BaseAccountsView({
  accounts, isAdmin, onUpdate, onDelete,
}: {
  accounts: BaseAccount[]
  isAdmin: boolean
  onUpdate: (a: BaseAccount) => void
  onDelete: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<Partial<BaseAccount>>({})
  const [saving, setSaving] = useState(false)
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive' | 'review'>('all')
  const [search, setSearch] = useState('')

  function startEdit(a: BaseAccount) {
    setEditingId(a.id)
    setEditState({
      account_name:     a.account_name     ?? '',
      client_code:      a.client_code      ?? '',
      risk_level:       a.risk_level       ?? '',
      risk_tolerance:   a.risk_tolerance   ?? '',
      activity_profile: a.activity_profile ?? undefined,
      comments:         a.comments         ?? '',
    })
  }

  function handleRiskChange(risk: string) {
    const tol = RISK_TOLERANCE[risk.toUpperCase()] ?? ''
    setEditState((s) => ({ ...s, risk_level: risk, risk_tolerance: tol }))
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const payload: Record<string, unknown> = {
      account_name:     editState.account_name     || null,
      client_code:      editState.client_code      || null,
      risk_level:       editState.risk_level       || null,
      risk_tolerance:   editState.risk_tolerance   || null,
      activity_profile: editState.activity_profile ?? null,
      comments:         editState.comments         || null,
      needs_review:     false,
    }
    const res = await fetch(`/api/monitoring/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
    }
    setSaving(false)
    setEditingId(null)
  }

  async function toggleActive(a: BaseAccount) {
    const res = await fetch(`/api/monitoring/accounts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    if (res.ok) onUpdate(await res.json())
  }

  async function deleteAccount(id: string, name: string) {
    if (!confirm(`¿Eliminar la cuenta ${name}? Esta acción no se puede deshacer.`)) return
    const res = await fetch(`/api/monitoring/accounts/${id}`, { method: 'DELETE' })
    if (res.ok) onDelete(id)
  }

  const filtered = accounts.filter((a) => {
    if (filterActive === 'active' && !a.is_active) return false
    if (filterActive === 'inactive' && a.is_active) return false
    if (filterActive === 'review' && !a.needs_review) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        a.account_name?.toLowerCase().includes(q) ||
        a.account_number?.toLowerCase().includes(q) ||
        a.client_code?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const reviewCount = accounts.filter(a => a.needs_review).length
  const inactiveCount = accounts.filter(a => !a.is_active).length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total cuentas"   value={accounts.length} />
        <StatCard label="Activas"         value={accounts.filter(a => a.is_active).length}  accent="green" />
        <StatCard label="Inactivas"       value={inactiveCount}   accent={inactiveCount > 0 ? 'neutral' : 'neutral'} />
        <StatCard label="Requieren datos" value={reviewCount}     accent={reviewCount > 0 ? 'amber' : 'neutral'} />
      </div>

      {reviewCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-700">{reviewCount} cuenta{reviewCount !== 1 ? 's' : ''} sin datos completos</p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              Estas cuentas aparecieron en el Excel del banco pero no estaban en la tabla base. Completá el riesgo y perfil de actividad para que los próximos monitoreos las calculen correctamente.
            </p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[
            { key: 'all',      label: `Todas (${accounts.length})` },
            { key: 'active',   label: `Activas (${accounts.filter(a => a.is_active).length})` },
            { key: 'inactive', label: `Inactivas (${inactiveCount})` },
            { key: 'review',   label: `Sin datos (${reviewCount})`, amber: true },
          ].map(({ key, label, amber }) => (
            <button
              key={key}
              onClick={() => setFilterActive(key as any)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filterActive === key
                  ? amber ? 'bg-amber-100 text-amber-700' : 'bg-[#2D3F52] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cuenta..."
          className="flex-1 min-w-[180px] text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cuenta</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cód.</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Riesgo</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Tolerancia</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-36">Perfil actividad</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Comentarios</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">Estado</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-gray-400">Sin resultados.</td></tr>
              ) : filtered.map((a) => {
                const isEditing = editingId === a.id
                return (
                  <tr
                    key={a.id}
                    className={`transition-colors ${
                      a.needs_review ? 'bg-amber-50/40'
                      : !a.is_active ? 'bg-gray-50/60 opacity-60'
                      : 'hover:bg-gray-50/40'
                    }`}
                  >
                    {/* Account */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.account_name ?? ''}
                          onChange={(e) => setEditState(s => ({ ...s, account_name: e.target.value }))}
                          className="w-full text-xs border border-[#16A34A]/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#16A34A] mb-1"
                          placeholder="Nombre de cuenta"
                        />
                      ) : (
                        <p className="font-medium text-gray-800 truncate max-w-[160px]">{a.account_name ?? <span className="text-gray-400 italic">Sin nombre</span>}</p>
                      )}
                      <p className="text-[10px] text-gray-400 font-mono">{a.account_number}</p>
                      {a.needs_review && !isEditing && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded tracking-wide">REVISAR</span>
                      )}
                    </td>

                    {/* Cod */}
                    <td className="px-4 py-2.5 text-gray-500 font-mono">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.client_code ?? ''}
                          onChange={(e) => setEditState(s => ({ ...s, client_code: e.target.value }))}
                          className="w-24 text-xs border border-[#16A34A]/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#16A34A] font-mono"
                          placeholder="7683xxx"
                        />
                      ) : (
                        a.client_code ?? <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Riesgo — editable */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <select
                          value={editState.risk_level ?? ''}
                          onChange={(e) => handleRiskChange(e.target.value)}
                          className="w-full text-xs border border-[#16A34A]/50 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                        >
                          <option value="">— Sin riesgo —</option>
                          <option value="BAJO">BAJO</option>
                          <option value="MEDIO">MEDIO</option>
                          <option value="ALTO">ALTO</option>
                        </select>
                      ) : a.risk_level ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          a.risk_level === 'ALTO' ? 'bg-red-100 text-red-700'
                          : a.risk_level === 'MEDIO' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>{a.risk_level}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Tolerancia — auto desde riesgo */}
                    <td className="px-4 py-2.5 text-gray-500">
                      {isEditing
                        ? <span className="text-[#2D3F52] font-semibold">{editState.risk_tolerance || '—'}</span>
                        : a.risk_tolerance ?? '—'}
                    </td>

                    {/* Perfil actividad — editable */}
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editState.activity_profile ?? ''}
                          onChange={(e) => setEditState((s) => ({ ...s, activity_profile: e.target.value ? parseFloat(e.target.value) : undefined }))}
                          className="w-full text-xs border border-[#16A34A]/50 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                          placeholder="0"
                        />
                      ) : a.activity_profile !== null
                        ? <span className="text-gray-700">{new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(a.activity_profile)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Comentarios — editable */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editState.comments ?? ''}
                          onChange={(e) => setEditState((s) => ({ ...s, comments: e.target.value }))}
                          className="w-full text-xs border border-[#16A34A]/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                          placeholder="Observaciones..."
                        />
                      ) : (
                        <span className="text-gray-500 truncate block max-w-[180px]" title={a.comments ?? ''}>{a.comments || '—'}</span>
                      )}
                    </td>

                    {/* Estado activo/inactivo */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleActive(a)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                          a.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {a.is_active ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(a.id)}
                              disabled={saving}
                              className="px-2.5 py-1 text-[11px] bg-[#2D3F52] text-white rounded hover:bg-[#354A5E] transition-colors disabled:opacity-60 font-medium"
                            >
                              {saving ? '...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 rounded transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(a)}
                              className="p-1.5 text-gray-400 hover:text-[#2D3F52] hover:bg-gray-100 rounded transition-colors"
                              title="Editar"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => deleteAccount(a.id, a.account_name ?? a.account_number)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Eliminar"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
