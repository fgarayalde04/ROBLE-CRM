'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AccountOpening, OpeningChecklistItem, OpeningStatus } from '@/types/platform'
import { differenceInDays, parseISO } from 'date-fns'

const STATUS_OPTIONS: { value: OpeningStatus; label: string }[] = [
  { value: 'carpeta_creada', label: 'Carpeta creada' },
  { value: 'recolectando_informacion', label: 'Recolectando informacion' },
  { value: 'documentacion_incompleta', label: 'Documentacion incompleta' },
  { value: 'documentacion_completa', label: 'Documentacion completa' },
  { value: 'formularios_enviados', label: 'Formularios enviados' },
  { value: 'enviado_al_banco', label: 'Enviado al banco' },
  { value: 'en_revision_banco', label: 'En revision banco' },
  { value: 'cuenta_abierta', label: 'Cuenta abierta' },
  { value: 'trabado', label: 'Trabado' },
  { value: 'descartado', label: 'Descartado' },
]

const STATUS_COLORS: Record<OpeningStatus, string> = {
  carpeta_creada: 'bg-gray-100 text-gray-600 border-gray-200',
  recolectando_informacion: 'bg-blue-50 text-blue-700 border-blue-200',
  documentacion_incompleta: 'bg-amber-50 text-amber-700 border-amber-200',
  documentacion_completa: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  formularios_enviados: 'bg-purple-50 text-purple-700 border-purple-200',
  enviado_al_banco: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  en_revision_banco: 'bg-orange-50 text-orange-700 border-orange-200',
  cuenta_abierta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trabado: 'bg-red-50 text-red-600 border-red-200',
  descartado: 'bg-gray-100 text-gray-400 border-gray-200',
}

const PRIORITY_COLORS: Record<string, string> = {
  baja: 'bg-gray-100 text-gray-500 border-gray-200',
  normal: 'bg-gray-100 text-gray-600 border-gray-200',
  alta: 'bg-amber-50 text-amber-700 border-amber-200',
  urgente: 'bg-red-50 text-red-600 border-red-200',
}

interface Props {
  opening: AccountOpening & { checklist_items: OpeningChecklistItem[] }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TabResumen({ opening }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<OpeningStatus>(opening.status)
  const [advisor, setAdvisor] = useState(opening.advisor ?? '')
  const [priority, setPriority] = useState<'baja' | 'normal' | 'alta' | 'urgente'>(opening.priority ?? 'normal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const checklist = opening.checklist_items ?? []
  const completed = checklist.filter((i) => i.completed).length
  const pct = checklist.length > 0 ? Math.round((completed / checklist.length) * 100) : 0

  const today = new Date()
  const daysElapsed = differenceInDays(today, parseISO(opening.start_date))

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const updates: Record<string, unknown> = {
      id: opening.id,
      status,
      advisor: advisor.trim() || null,
      priority,
    }

    if (status === 'documentacion_completa' && !opening.documentation_completed_at) {
      updates.documentation_completed_at = new Date().toISOString()
    }
    if (status === 'enviado_al_banco' && !opening.sent_to_bank_at) {
      updates.sent_to_bank_at = new Date().toISOString()
    }
    if (status === 'cuenta_abierta' && !opening.account_opened_at) {
      updates.account_opened_at = new Date().toISOString()
    }

    try {
      const res = await fetch('/api/openings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Error al guardar')
      }

      if (status === 'cuenta_abierta' && opening.client_id) {
        await fetch('/api/clients', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: opening.client_id, status: 'activo' }),
        })
      }

      setSaved(true)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const isDirty =
    status !== opening.status ||
    advisor !== (opening.advisor ?? '') ||
    priority !== (opening.priority ?? 'normal')

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Informacion general</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Cliente */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Cliente</p>
            {opening.client ? (
              <Link
                href={`/clients/${opening.client.id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {opening.client.first_name} {opening.client.last_name}
              </Link>
            ) : (
              <p className="text-sm text-gray-400">Sin cliente asignado</p>
            )}
          </div>

          {/* Carpeta */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Nombre de carpeta</p>
            <p className="text-sm font-medium text-gray-900">{opening.folder_name}</p>
          </div>

          {/* Estado actual */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Estado actual</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_COLORS[opening.status]}`}>
              {STATUS_OPTIONS.find((s) => s.value === opening.status)?.label ?? opening.status}
            </span>
          </div>

          {/* Prioridad actual */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Prioridad</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${PRIORITY_COLORS[opening.priority ?? 'normal']}`}>
              {(opening.priority ?? 'normal').charAt(0).toUpperCase() + (opening.priority ?? 'normal').slice(1)}
            </span>
          </div>

          {/* Link carpeta */}
          {opening.onedrive_url && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-1">Carpeta</p>
              <a
                href={opening.onedrive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline break-all"
              >
                {opening.onedrive_url}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Metricas */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border p-4 ${daysElapsed > 60 ? 'bg-red-50 border-red-200' : daysElapsed > 30 ? 'bg-amber-50 border-amber-200' : 'bg-white border-[#E2E8F0]'}`}>
          <p className={`text-xs ${daysElapsed > 60 ? 'text-red-500' : daysElapsed > 30 ? 'text-amber-600' : 'text-gray-400'}`}>Dias transcurridos</p>
          <p className={`text-3xl font-bold mt-1 ${daysElapsed > 60 ? 'text-red-700' : daysElapsed > 30 ? 'text-amber-700' : 'text-gray-900'}`}>{daysElapsed}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-gray-400">Progreso checklist</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pct}%</p>
          <p className="text-xs text-gray-400 mt-0.5">{completed} / {checklist.length} items</p>
        </div>
      </div>

      {/* Fechas clave */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Fechas clave</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-gray-400">Inicio</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(opening.start_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Documentacion completa</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(opening.documentation_completed_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Enviado al banco</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(opening.sent_to_bank_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Cuenta abierta</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(opening.account_opened_at)}</p>
          </div>
        </div>
      </div>

      {/* Edicion */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Editar</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OpeningStatus)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Asesor</label>
            <input
              type="text"
              value={advisor}
              onChange={(e) => setAdvisor(e.target.value)}
              placeholder="Nombre del asesor"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'baja' | 'normal' | 'alta' | 'urgente')}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="baja">Baja</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        {saved && <p className="text-xs text-emerald-600 mt-3">Guardado correctamente.</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-4 py-2 text-sm rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {!isDirty && !saved && (
            <span className="text-xs text-gray-400">Sin cambios pendientes</span>
          )}
        </div>
      </div>
    </div>
  )
}
