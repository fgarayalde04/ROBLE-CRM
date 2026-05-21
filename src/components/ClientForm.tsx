'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Client, ClientStatus, RiskProfile, ClientType } from '@/types/platform'
import { supabase } from '@/lib/supabase/client'

interface Props {
  initial?: Partial<Client>
  mode: 'new' | 'edit'
}

export default function ClientForm({ initial, mode }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    client_number: initial?.client_number ?? '',
    first_name: initial?.first_name ?? '',
    last_name: initial?.last_name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    status: (initial?.status ?? 'prospecto') as ClientStatus,
    risk_profile: (initial?.risk_profile ?? '') as RiskProfile | '',
    client_type: (initial?.client_type ?? 'local') as ClientType,
    advisor: initial?.advisor ?? '',
    notes: initial?.notes ?? '',
    onedrive_folder_url: initial?.onedrive_folder_url ?? '',
  })

  function set(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = {
        client_number: form.client_number.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        risk_profile: (form.risk_profile || null) as RiskProfile | null,
        client_type: form.client_type,
        advisor: form.advisor.trim() || null,
        notes: form.notes.trim() || null,
        onedrive_folder_url: form.onedrive_folder_url.trim() || null,
      }

      if (mode === 'new') {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al crear cliente')
        router.push(`clients/${data.id}`)
      } else {
        const res = await fetch('/api/clients', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: initial!.id!, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
        router.push(`clients/${initial!.id}`)
      }
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Identificación</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="N° de cliente *">
            <input
              required
              value={form.client_number}
              onChange={(e) => set('client_number', e.target.value)}
              placeholder="Ej: CLI-001"
              className={inputClass}
            />
          </Field>
          <div />
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Datos personales</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre *">
            <input required value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Apellido *">
            <input required value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Teléfono">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Perfil</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de cliente">
            <select value={form.client_type} onChange={(e) => set('client_type', e.target.value)} className={selectClass}>
              <option value="local">Roble Local</option>
              <option value="internacional">Roble Internacional</option>
            </select>
          </Field>
          <Field label="Estado">
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={selectClass}>
              <option value="prospecto">Prospecto</option>
              <option value="activo">Activo</option>
              <option value="en_apertura">En apertura</option>
              <option value="pendiente_documentacion">Pendiente documentacion</option>
              <option value="en_revision">En revision</option>
              <option value="inactivo">Inactivo</option>
              <option value="cerrado">Cerrado</option>
              <option value="descartado">Descartado</option>
            </select>
          </Field>
          <Field label="Perfil de riesgo">
            <select value={form.risk_profile} onChange={(e) => set('risk_profile', e.target.value)} className={selectClass}>
              <option value="">— Sin asignar —</option>
              <option value="conservador">Conservador</option>
              <option value="moderado">Moderado</option>
              <option value="moderado_agresivo">Moderado agresivo</option>
              <option value="agresivo">Agresivo</option>
            </select>
          </Field>
          <Field label="Asesor responsable">
            <input value={form.advisor} onChange={(e) => set('advisor', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">OneDrive</h2>
        <Field label="Link carpeta OneDrive">
          <input
            type="url"
            value={form.onedrive_folder_url}
            onChange={(e) => set('onedrive_folder_url', e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        {form.onedrive_folder_url && (
          <a
            href={form.onedrive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Probar link
          </a>
        )}
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Notas internas</h2>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={4}
          className={`${inputClass} resize-none`}
          placeholder="Observaciones, notas de seguimiento..."
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : mode === 'new' ? 'Crear cliente' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-300'

const selectClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900'
