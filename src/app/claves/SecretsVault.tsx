'use client'

import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type Secret = {
  id: string
  service_name: string
  username: string | null
  password: string | null
  category: string
  url: string | null
  company: string | null
  responsible: string | null
  notes: string | null
  status: string
  last_updated_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

type FormData = Omit<Secret, 'id' | 'created_at' | 'updated_at' | 'last_updated_at'>

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'bancos', 'proveedores', 'plataformas internas', 'correos',
  'impuestos', 'brokers', 'custodios', 'software', 'microsoft / one drive', 'otros',
]

const STATUSES = ['activa', 'revisar', 'vencida', 'reemplazada']

const STATUS_COLORS: Record<string, string> = {
  activa:      'bg-green-50 text-green-600',
  revisar:     'bg-amber-50 text-amber-600',
  vencida:     'bg-red-50 text-red-500',
  reemplazada: 'bg-gray-100 text-gray-400',
}

// Icon background per category — neutral, uniform
const CATEGORY_BG: Record<string, string> = {
  bancos:                 'bg-[#EEF1F5] text-[#2D3F52]',
  proveedores:            'bg-[#EEF1F5] text-[#2D3F52]',
  'plataformas internas': 'bg-[#EEF1F5] text-[#2D3F52]',
  correos:                'bg-[#EEF1F5] text-[#2D3F52]',
  impuestos:              'bg-[#EEF1F5] text-[#2D3F52]',
  brokers:                'bg-[#EEF1F5] text-[#2D3F52]',
  custodios:              'bg-[#EEF1F5] text-[#2D3F52]',
  software:               'bg-[#EEF1F5] text-[#2D3F52]',
  'microsoft / one drive': 'bg-blue-50 text-blue-700',
  otros:                  'bg-[#EEF1F5] text-[#2D3F52]',
}

const CATEGORY_LABEL_COLORS: Record<string, string> = {
  bancos:                 'bg-gray-100 text-gray-500',
  proveedores:            'bg-gray-100 text-gray-500',
  'plataformas internas': 'bg-gray-100 text-gray-500',
  correos:                'bg-gray-100 text-gray-500',
  impuestos:              'bg-gray-100 text-gray-500',
  brokers:                'bg-gray-100 text-gray-500',
  custodios:              'bg-gray-100 text-gray-500',
  software:               'bg-gray-100 text-gray-500',
  'microsoft / one drive': 'bg-blue-50 text-blue-600',
  otros:                  'bg-gray-100 text-gray-500',
}

const EMPTY_FORM: FormData = {
  service_name: '',
  username: null,
  password: null,
  category: 'otros',
  url: null,
  company: null,
  responsible: null,
  notes: null,
  status: 'activa',
  expires_at: null,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isExpired(d: string | null): boolean {
  if (!d) return false
  return new Date(d).getTime() < Date.now()
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

interface FormModalProps {
  mode: 'add' | 'edit'
  initial: FormData
  saving: boolean
  onClose: () => void
  onSubmit: (data: FormData) => void
}

function FormModal({ mode, initial, saving, onClose, onSubmit }: FormModalProps) {
  const [form, setForm] = useState<FormData>(initial)
  const [showPass, setShowPass] = useState(false)

  function set(key: keyof FormData, value: string | null) {
    setForm(prev => ({ ...prev, [key]: value === '' ? null : value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#2D3F52]">
            {mode === 'add' ? 'Nuevo acceso' : 'Editar acceso'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Servicio <span className="text-red-500">*</span></label>
            <input
              type="text" required value={form.service_name}
              onChange={e => set('service_name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
              placeholder="Ej: Banco ITAU"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Usuario</label>
              <input
                type="text" value={form.username ?? ''}
                onChange={e => set('username', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
                placeholder="usuario@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contrasena</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={form.password ?? ''}
                  onChange={e => set('password', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]">
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
            <input type="url" value={form.url ?? ''} onChange={e => set('url', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
              placeholder="https://" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
              <input type="text" value={form.company ?? ''} onChange={e => set('company', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
                placeholder="Nombre empresa" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Responsable</label>
              <input type="text" value={form.responsible ?? ''} onChange={e => set('responsible', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]"
                placeholder="Nombre" />
            </div>
          </div>

          <div className="w-1/2 pr-1.5">
            <label className="block text-xs font-medium text-gray-700 mb-1">Vencimiento</label>
            <input type="date" value={form.expires_at ?? ''} onChange={e => set('expires_at', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={3} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A] resize-none"
              placeholder="Observaciones adicionales..." />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#4A7C35' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3D6A2C' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A7C35' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ secret, saving, onClose, onConfirm }: { secret: Secret; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#2D3F52] mb-1">Eliminar acceso</h2>
        <p className="text-sm text-gray-500 mb-1">
          {secret.username ? <><span className="font-medium text-gray-700">{secret.username}</span> en </> : ''}
          {secret.service_name}
        </p>
        <p className="text-xs text-gray-400 mb-6">Esta accion no se puede deshacer.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
            {saving ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: '', label: '— Ignorar —' },
  { value: 'service_name', label: 'Servicio *' },
  { value: 'username', label: 'Usuario' },
  { value: 'password', label: 'Contrasena' },
  { value: 'category', label: 'Categoria' },
  { value: 'url', label: 'URL' },
  { value: 'company', label: 'Empresa' },
  { value: 'responsible', label: 'Responsable' },
  { value: 'notes', label: 'Notas' },
  { value: 'status', label: 'Estado' },
  { value: 'expires_at', label: 'Vencimiento' },
]

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' })
      const json: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!json.length) return
      setRows(json)
      const hdrs = Object.keys(json[0])
      setHeaders(hdrs)
      const auto: Record<string, string> = {}
      hdrs.forEach(h => {
        const lower = h.toLowerCase().replace(/[\s_-]/g, '')
        const match = FIELD_OPTIONS.find(f => f.value && f.value.replace(/_/g, '') === lower)
        auto[h] = match ? match.value : ''
      })
      setMapping(auto)
      setStep(2)
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    setStep(3)
    let done = 0
    setProgress({ done: 0, total: rows.length })
    for (const row of rows) {
      const record: Record<string, string | null> = {}
      for (const [header, field] of Object.entries(mapping)) {
        if (field) record[field] = String(row[header] ?? '').trim() || null
      }
      if (record.service_name) {
        await fetch('/api/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }).catch(() => {})
      }
      done++
      setProgress({ done, total: rows.length })
    }
    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#2D3F52]">Importar claves</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="px-6 py-5">
          {step === 1 && (
            <div className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-[#16A34A] bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f) }}
              onClick={() => fileRef.current?.click()}>
              <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
              <p className="text-sm font-medium text-gray-700">Arrastra un archivo o hace clic para seleccionar</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx o .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600"><strong>{rows.length}</strong> filas detectadas. Mapeá las columnas.</p>
              <div className="grid grid-cols-2 gap-3">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 truncate w-28 shrink-0">{h}</span>
                    <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                    <select value={mapping[h] ?? ''} onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                      {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                <button onClick={handleImport} disabled={!Object.values(mapping).includes('service_name')}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: '#4A7C35' }}>
                  Importar {rows.length} registros
                </button>
              </div>
            </div>
          )}
          {step === 3 && progress && (
            <div className="py-8 text-center space-y-4">
              <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-700 font-medium">Importando... {progress.done} / {progress.total}</p>
              <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto">
                <div className="h-2 rounded-full bg-[#16A34A] transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function CopyIcon({ checked }: { checked: boolean }) {
  return checked ? (
    <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  )
}

// ─── Credential Card (inside service view) ────────────────────────────────────

function CredentialCard({
  secret, onEdit, onDelete,
}: {
  secret: Secret
  onEdit: () => void
  onDelete: () => void
}) {
  const [showPass, setShowPass] = useState(false)
  const [copied, setCopied] = useState<'user' | 'pass' | null>(null)

  function copy(field: 'user' | 'pass', text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const expired = isExpired(secret.expires_at)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[secret.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {secret.status}
          </span>
          {secret.company && (
            <span className="text-xs text-gray-400">{secret.company}</span>
          )}
          {secret.responsible && (
            <span className="text-xs text-gray-400">· {secret.responsible}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {secret.url && (
            <a href={secret.url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-gray-300 hover:text-[#16A34A] rounded transition-colors" title="Abrir enlace">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
          <button onClick={onEdit} className="p-1.5 text-gray-300 hover:text-[#2D3F52] rounded transition-colors" title="Editar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors" title="Eliminar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Credentials */}
      <div className="space-y-3">
        {/* Usuario */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Usuario</p>
          {secret.username ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-gray-800 font-mono truncate">{secret.username}</span>
              <button onClick={() => copy('user', secret.username!)}
                className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <CopyIcon checked={copied === 'user'} />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-300 px-3">—</p>
          )}
        </div>

        {/* Contrasena */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Contrasena</p>
          {secret.password ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-gray-800 font-mono tracking-wider">
                {showPass ? secret.password : '••••••••••••'}
              </span>
              <button onClick={() => setShowPass(v => !v)}
                className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <EyeIcon open={showPass} />
              </button>
              <button onClick={() => copy('pass', secret.password!)}
                className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <CopyIcon checked={copied === 'pass'} />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-300 px-3">—</p>
          )}
        </div>
      </div>

      {/* Footer: notas y vencimiento */}
      {(secret.notes || secret.expires_at) && (
        <div className="mt-3 pt-3 border-t border-gray-50 space-y-1">
          {secret.notes && (
            <p className="text-xs text-gray-500 leading-relaxed">{secret.notes}</p>
          )}
          {secret.expires_at && (
            <p className={`text-xs font-medium ${expired ? 'text-red-500' : 'text-orange-500'}`}>
              Vence: {formatDate(secret.expires_at)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SecretsVault() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openService, setOpenService] = useState<string | null>(null)
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data?: Secret; prefillService?: string }>(null)
  const [deleteTarget, setDeleteTarget] = useState<Secret | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function fetchSecrets() {
    setLoading(true)
    try {
      const res = await fetch('/api/secrets')
      const data = await res.json()
      setSecrets(Array.isArray(data) ? data : [])
    } catch { setSecrets([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSecrets() }, [])

  async function handleSave(formData: FormData) {
    setSaving(true)
    try {
      if (modal?.mode === 'add') {
        await fetch('/api/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      } else if (modal?.mode === 'edit' && modal.data) {
        await fetch(`/api/secrets/${modal.data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      }
      setModal(null)
      await fetchSecrets()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await fetch(`/api/secrets/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await fetchSecrets()
    } finally { setSaving(false) }
  }

  // Group by service name
  const grouped = secrets.reduce<Record<string, Secret[]>>((acc, s) => {
    if (!acc[s.service_name]) acc[s.service_name] = []
    acc[s.service_name].push(s)
    return acc
  }, {})

  // Filter service folders by search
  const serviceNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
  const filteredServices = serviceNames.filter(name => {
    if (!search) return true
    const q = search.toLowerCase()
    return name.toLowerCase().includes(q) ||
      grouped[name].some(s => s.username?.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q))
  })

  // ── Service detail view ──────────────────────────────────────────────────────
  if (openService) {
    const items = grouped[openService] ?? []
    const category = items[0]?.category ?? 'otros'
    const url = items.find(i => i.url)?.url

    return (
      <>
        {/* Back bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpenService(null)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#2D3F52] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Volver
            </button>
            <span className="text-gray-200">/</span>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${CATEGORY_BG[category] ?? 'bg-gray-100 text-gray-500'}`}>
                {openService.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-semibold text-[#2D3F52]">{openService}</h2>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {items.length} {items.length === 1 ? 'acceso' : 'accesos'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Abrir sitio
              </a>
            )}
            <button
              onClick={() => setModal({ mode: 'add', prefillService: openService })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: '#4A7C35' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3D6A2C' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A7C35' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Agregar acceso
            </button>
          </div>
        </div>

        {/* Credential cards */}
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No hay accesos registrados para este servicio.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(s => (
              <CredentialCard
                key={s.id}
                secret={s}
                onEdit={() => setModal({ mode: 'edit', data: s })}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </div>
        )}

        {/* Modals */}
        {modal && (
          <FormModal
            mode={modal.mode}
            initial={modal.data
              ? { service_name: modal.data.service_name, username: modal.data.username, password: modal.data.password, category: modal.data.category, url: modal.data.url, company: modal.data.company, responsible: modal.data.responsible, notes: modal.data.notes, status: modal.data.status, expires_at: modal.data.expires_at }
              : { ...EMPTY_FORM, service_name: modal.prefillService ?? '' }
            }
            saving={saving}
            onClose={() => setModal(null)}
            onSubmit={handleSave}
          />
        )}
        {deleteTarget && (
          <DeleteModal secret={deleteTarget} saving={saving} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
        )}
      </>
    )
  }

  // ── Folder grid view ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
            {serviceNames.length} servicios · {secrets.length} accesos
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImportOpen(true)}
            className="px-3 py-1.5 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Importar
          </button>
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#4A7C35' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3D6A2C' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4A7C35' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo servicio
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar servicio..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:border-[#16A34A] bg-white"
        />
      </div>

      {/* Folder grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <p className="text-sm font-medium text-gray-400">No se encontraron servicios</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredServices.map(name => {
            const items = grouped[name]
            const category = items[0]?.category ?? 'otros'
            const hasIssue = items.some(i => i.status === 'revisar' || i.status === 'vencida')

            return (
              <button
                key={name}
                onClick={() => setOpenService(name)}
                className="group bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md hover:border-gray-200 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mb-3 ${CATEGORY_BG[category] ?? 'bg-gray-100 text-gray-500'}`}>
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* Name */}
                <p className="text-sm font-semibold text-[#2D3F52] leading-tight mb-1 group-hover:text-[#4A7C35] transition-colors">
                  {name}
                </p>

                {/* Count + category */}
                <p className="text-xs text-gray-400 mb-2">
                  {items.length} {items.length === 1 ? 'acceso' : 'accesos'}
                </p>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_LABEL_COLORS[category] ?? 'bg-gray-50 text-gray-500'}`}>
                    {category}
                  </span>
                  {hasIssue && (
                    <span className="w-2 h-2 rounded-full bg-yellow-400" title="Requiere revision" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <FormModal
          mode={modal.mode}
          initial={modal.data
            ? { service_name: modal.data.service_name, username: modal.data.username, password: modal.data.password, category: modal.data.category, url: modal.data.url, company: modal.data.company, responsible: modal.data.responsible, notes: modal.data.notes, status: modal.data.status, expires_at: modal.data.expires_at }
            : { ...EMPTY_FORM, service_name: modal.prefillService ?? '' }
          }
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={handleSave}
        />
      )}
      {deleteTarget && (
        <DeleteModal secret={deleteTarget} saving={saving} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onImported={fetchSecrets} />
      )}
    </>
  )
}
