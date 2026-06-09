'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import OneDriveFolderButton from '@/components/OneDriveFolderButton'

// ─── Checkbox localStorage backup ───────────────────────────────────────────
// Persists checkbox state keyed by folder_path so that even if DB records
// are deleted and re-synced (new IDs), we can restore the previous state.

const BACKUP_KEY = 'banco_central_checkboxes_v3'

type CheckboxSnapshot = {
  ficha:             boolean
  perfil_inversor:   boolean
  ci:                boolean
  documentos_legales: boolean
  cuestionario:      boolean
  perfil_de_riesgo:  boolean
}
type BackupMap = Record<string, CheckboxSnapshot> // item_id (or folder_path fallback) → checkboxes

/** Stable key for backup: item_id first (SP records), then folder_path (local), then id */
function backupKey(r: BancoCentralRecord): string {
  return r.item_id ?? r.folder_path ?? r.id
}

function loadBackup(): BackupMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    return raw ? (JSON.parse(raw) as BackupMap) : {}
  } catch { return {} }
}

function saveBackup(records: BancoCentralRecord[]) {
  if (typeof window === 'undefined') return
  const map: BackupMap = {}
  for (const r of records) {
    map[backupKey(r)] = {
      ficha:              r.ficha,
      perfil_inversor:    r.perfil_inversor,
      ci:                 r.ci,
      documentos_legales: r.documentos_legales,
      cuestionario:       r.cuestionario,
      perfil_de_riesgo:   r.perfil_de_riesgo,
    }
  }
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(map)) } catch {}
}
// ────────────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'number'
type SortDir = 'asc' | 'desc'
type FilterStatus = 'all' | 'incompleto' | 'completo' | 'cerrada'

export interface BancoCentralRecord {
  id: string
  customer_number: string | null
  nombre_cliente: string | null
  folder_name: string
  folder_path: string | null
  drive_id: string | null
  item_id: string | null
  web_url: string | null
  type: 'local' | 'internacional'
  fa: string | null
  ficha: boolean
  perfil_inversor: boolean
  ci: boolean
  documentos_legales: boolean
  cuestionario: boolean
  perfil_de_riesgo: boolean
  // Legacy fields kept in DB but not shown in UI
  lista_verificacion: boolean
  cumplo: boolean
  comentario: string | null
  status: string
  linked_client_id: string | null
  source: string | null
  last_synced_at: string | null
  updated_at: string | null
}

const CHECKBOX_FIELDS = [
  { key: 'ficha'              as const, label: 'Ficha cliente' },
  { key: 'perfil_inversor'    as const, label: 'Perfil inversor' },
  { key: 'ci'                 as const, label: 'Cédula' },
  { key: 'documentos_legales' as const, label: 'Docs legales' },
  { key: 'cuestionario'       as const, label: 'Cuest. asesor' },
  { key: 'perfil_de_riesgo'   as const, label: 'Perfil riesgo' },
]

type CheckboxKey = typeof CHECKBOX_FIELDS[number]['key']

function displayName(folderName: string) {
  return folderName.replace(/^\d+\s*-\s*/, '').trim()
}

function Checkbox({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mx-auto ${
        disabled
          ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-40'
          : checked
            ? 'bg-emerald-500 border-emerald-500'
            : 'bg-white border-gray-300 hover:border-gray-400'
      }`}
      title={disabled ? 'Cuenta cerrada' : checked ? 'Disponible — clic para marcar faltante' : 'Faltante — clic para marcar disponible'}
    >
      {checked && !disabled && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

function FaCell({ recordId, value }: { recordId: string; value: string | null }) {
  const [text, setText] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    setText(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      await fetch('/api/banco-central', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, field: 'fa', value: v }),
      })
      setSaving(false)
    }, 600)
  }

  return (
    <div className="relative flex justify-center">
      <input
        type="text"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="—"
        maxLength={6}
        className={`w-12 text-center text-[11px] font-semibold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#16A34A] focus:outline-none py-0.5 transition-colors ${
          saving ? 'text-gray-300' : text ? 'text-[#2D3F52]' : 'text-gray-300'
        }`}
      />
    </div>
  )
}

function ComentarioCell({ recordId, value, disabled }: { recordId: string; value: string | null; disabled?: boolean }) {
  const [text, setText] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    setText(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      await fetch('/api/banco-central', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, field: 'comentario', value: v }),
      })
      setSaving(false)
    }, 600)
  }

  if (disabled) {
    return <span className="text-xs text-red-400 italic">{text || '—'}</span>
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Agregar nota..."
        className="w-full text-xs bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#16A34A] focus:outline-none py-0.5 text-gray-600 placeholder-gray-300 transition-colors min-w-[140px]"
      />
      {saving && <span className="absolute right-0 top-0 text-[10px] text-gray-300">guardando...</span>}
    </div>
  )
}

function SortHeader({ label, sortKey, active, dir, onClick, className = '' }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir
  onClick: (k: SortKey) => void; className?: string
}) {
  const isActive = active === sortKey
  return (
    <th className={`text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${className}`}>
      <button onClick={() => onClick(sortKey)} className="flex items-center gap-1 hover:text-[#2D3F52] transition-colors">
        {label}
        <span className="flex flex-col leading-none ml-0.5">
          <svg className={`w-2 h-2 -mb-px ${isActive && dir === 'asc' ? 'text-[#2D3F52]' : 'text-gray-300'}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 0L8 4H0z" /></svg>
          <svg className={`w-2 h-2 ${isActive && dir === 'desc' ? 'text-[#2D3F52]' : 'text-gray-300'}`} viewBox="0 0 8 4" fill="currentColor"><path d="M4 4L0 0h8z" /></svg>
        </span>
      </button>
    </th>
  )
}

export default function BancoCentralTable({ initialRecords }: { initialRecords: BancoCentralRecord[] }) {
  const [records, setRecords] = useState<BancoCentralRecord[]>(initialRecords)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [confirmClose, setConfirmClose] = useState<string | null>(null) // record id pending confirm
  const [restoring, setRestoring] = useState(false)

  // ── Auto-backup: save checkbox state to localStorage whenever records change ──
  useEffect(() => {
    saveBackup(records)
  }, [records])

  // ── Auto-restore: on mount, compare localStorage vs DB and fix divergences ──
  useEffect(() => {
    const backup = loadBackup()
    if (Object.keys(backup).length === 0) return

    const FIELDS: (keyof CheckboxSnapshot)[] = [
      'ficha', 'perfil_inversor', 'ci', 'documentos_legales', 'cuestionario', 'perfil_de_riesgo',
    ]

    type RestoreItem = CheckboxSnapshot & { id: string }
    const toRestore: RestoreItem[] = []

    for (const r of initialRecords) {
      if (r.status === 'cerrada') continue
      const saved = backup[backupKey(r)]
      if (!saved) continue
      const differs = FIELDS.some((f) => r[f] !== saved[f])
      if (differs) toRestore.push({ id: r.id, ...saved })
    }

    if (toRestore.length === 0) return

    // Optimistic UI update
    setRestoring(true)
    setRecords((prev) =>
      prev.map((r) => {
        const item = toRestore.find((t) => t.id === r.id)
        if (!item) return r
        const updated = { ...r, ...item }
        const allChecked = FIELDS.every((f) => updated[f])
        return { ...updated, status: allChecked ? 'completo' : 'incompleto' }
      }),
    )

    // Persist restored state to DB
    fetch('/api/banco-central', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: toRestore }),
    }).finally(() => setRestoring(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs only on mount

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  async function toggleField(recordId: string, field: CheckboxKey, current: boolean) {
    const newValue = !current
    setSaving(`${recordId}:${field}`)
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== recordId) return r
        const updated = { ...r, [field]: newValue }
        const allChecked = CHECKBOX_FIELDS.every((f) => updated[f.key])
        return { ...updated, status: allChecked ? 'completo' : 'incompleto' }
      }),
    )
    await fetch('/api/banco-central', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recordId, field, value: newValue }),
    })
    setSaving(null)
  }

  async function cerrarCuenta(recordId: string) {
    setSaving(`${recordId}:cerrar`)
    setRecords((prev) => prev.map((r) => r.id === recordId ? { ...r, status: 'cerrada' } : r))
    await fetch('/api/banco-central', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recordId, action: 'cerrar' }),
    })
    setSaving(null)
    setConfirmClose(null)
  }

  async function reabrirCuenta(recordId: string) {
    setSaving(`${recordId}:reabrir`)
    // Optimistic: recompute from current checkboxes
    setRecords((prev) => prev.map((r) => {
      if (r.id !== recordId) return r
      const allChecked = CHECKBOX_FIELDS.every((f) => r[f.key])
      return { ...r, status: allChecked ? 'completo' : 'incompleto' }
    }))
    await fetch('/api/banco-central', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recordId, action: 'reabrir' }),
    })
    setSaving(null)
  }

  const q = search.toLowerCase()

  const counts = useMemo(() => ({
    all:       records.length,
    incompleto: records.filter(r => r.status === 'incompleto').length,
    completo:   records.filter(r => r.status === 'completo').length,
    cerrada:    records.filter(r => r.status === 'cerrada').length,
  }), [records])

  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      const name = displayName(r.folder_name).toLowerCase()
      const matchSearch =
        !q ||
        name.includes(q) ||
        r.folder_name.toLowerCase().includes(q) ||
        (r.customer_number ?? '').includes(q) ||
        (r.comentario ?? '').toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || r.status === filterStatus
      return matchSearch && matchStatus
    })
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = displayName(a.folder_name).localeCompare(displayName(b.folder_name), 'es', { sensitivity: 'base' })
      } else {
        cmp = (a.customer_number ?? '').localeCompare(b.customer_number ?? '', undefined, { numeric: true })
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [records, q, filterStatus, sortKey, sortDir])

  const FILTERS: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all',       label: 'Todos',       count: counts.all },
    { key: 'incompleto', label: 'Incompletos', count: counts.incompleto },
    { key: 'completo',  label: 'Completos',   count: counts.completo },
    { key: 'cerrada',   label: 'Cerradas',    count: counts.cerrada },
  ]

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] w-64"
          />
        </div>

        {/* Status filters */}
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium flex items-center gap-1.5 ${
                filterStatus === f.key
                  ? f.key === 'cerrada'
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-[#2D3F52] text-white border-[#2D3F52]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {f.label}
              <span className={`text-[10px] px-1 py-0.5 rounded-full font-semibold ${
                filterStatus === f.key
                  ? f.key === 'cerrada' ? 'bg-red-200 text-red-700' : 'bg-white/20 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400 ml-auto flex items-center gap-2">
          {restoring && (
            <span className="text-amber-500 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restaurando datos...
            </span>
          )}
          {filtered.length} de {records.length}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded border-2 bg-emerald-500 border-emerald-500 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          Disponible
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded border-2 bg-white border-gray-300" />
          Faltante
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-red-200 border border-red-300" />
          Cuenta cerrada
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-12">FA</th>
              <SortHeader label="N° Cliente" sortKey="number" active={sortKey} dir={sortDir} onClick={toggleSort} className="px-4 py-3 w-24" />
              <SortHeader label="Nombre"     sortKey="name"   active={sortKey} dir={sortDir} onClick={toggleSort} className="px-4 py-3" />
              {CHECKBOX_FIELDS.map((f) => (
                <th key={f.key} className="text-center px-2 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap w-24">
                  {f.label}
                </th>
              ))}
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">Comentario</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">Carpeta</th>
              <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={CHECKBOX_FIELDS.length + 5} className="px-4 py-10 text-center text-sm text-gray-400">Sin resultados</td>
              </tr>
            ) : (
              filtered.map((record) => {
                const isCerrada = record.status === 'cerrada'
                const isComplete = record.status === 'completo'
                const isSavingRow = saving?.startsWith(record.id)

                return (
                  <tr
                    key={record.id}
                    className={`transition-colors ${isCerrada ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50/70'}`}
                  >
                    {/* FA — editable */}
                    <td className="px-2 py-2.5 text-center">
                      <FaCell recordId={record.id} value={record.fa} />
                    </td>

                    {/* N° Cliente */}
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-xs ${isCerrada ? 'text-red-400' : 'text-gray-400'}`}>
                        {record.customer_number ?? '—'}
                      </span>
                    </td>

                    {/* Nombre */}
                    <td className="px-4 py-2.5 max-w-[220px]">
                      <div className="flex items-center gap-2">
                        {isCerrada && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-red-300" />
                        )}
                        <span className={`text-sm font-medium truncate ${isCerrada ? 'text-red-500 line-through decoration-red-300' : 'text-[#2D3F52]'}`} title={record.folder_name}>
                          {displayName(record.folder_name)}
                        </span>
                      </div>
                    </td>

                    {/* Checkboxes */}
                    {CHECKBOX_FIELDS.map((f) => {
                      const checked = record[f.key]
                      const isFieldSaving = saving === `${record.id}:${f.key}`
                      return (
                        <td key={f.key} className="px-2 py-2.5 text-center">
                          <div className={isFieldSaving ? 'opacity-40 pointer-events-none' : ''}>
                            <Checkbox
                              checked={checked}
                              disabled={isCerrada}
                              onChange={() => toggleField(record.id, f.key, checked)}
                            />
                          </div>
                        </td>
                      )
                    })}

                    {/* Comentario */}
                    <td className="px-3 py-2.5">
                      <ComentarioCell recordId={record.id} value={record.comentario} disabled={isCerrada} />
                    </td>

                    {/* Carpeta */}
                    <td className="px-3 py-2.5">
                      <OneDriveFolderButton
                        driveId={record.drive_id}
                        itemId={record.item_id}
                        webUrl={record.web_url}
                        label="Abrir carpeta"
                      />
                    </td>

                    {/* Estado + acción */}
                    <td className="px-3 py-2.5 text-center">
                      {isCerrada ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-red-100 text-red-600 border-red-200 whitespace-nowrap">
                            Cerrada
                          </span>
                          <button
                            onClick={() => reabrirCuenta(record.id)}
                            disabled={isSavingRow}
                            className="text-[10px] text-gray-400 hover:text-gray-600 underline transition-colors disabled:opacity-40"
                          >
                            Reabrir
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded border whitespace-nowrap ${
                            isComplete
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}>
                            {isComplete ? 'Completo' : 'Incompleto'}
                          </span>

                          {/* Cerrar button / confirm */}
                          {confirmClose === record.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => cerrarCuenta(record.id)}
                                className="text-[10px] text-red-600 hover:text-red-700 font-medium transition-colors"
                              >
                                Confirmar
                              </button>
                              <span className="text-gray-300 text-[10px]">·</span>
                              <button
                                onClick={() => setConfirmClose(null)}
                                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmClose(record.id)}
                              disabled={isSavingRow}
                              className="text-[10px] text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              Cerrar cuenta
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
