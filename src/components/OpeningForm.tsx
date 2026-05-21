'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { AccountOpening, OpeningStatus, Client } from '@/types/platform'

const DEFAULT_CHECKLIST = [
  'Confirmar datos del cliente',
  'Solicitar documento de identidad / pasaporte',
  'Solicitar comprobante de domicilio',
  'Solicitar perfil de riesgo',
  'Enviar formularios de apertura',
  'Recibir formularios firmados',
  'Revisar documentación',
  'Enviar documentación a aprobación',
  'Confirmar apertura de cuenta',
  'Registrar número de cliente',
  'Agregar link de carpeta',
  'Marcar cuenta como activa',
]

interface Props {
  mode: 'new' | 'edit'
  initial?: Partial<AccountOpening>
  clients: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'>[]
}

const inputClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-300'
const selectClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900'

export default function OpeningForm({ mode, initial, clients }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    client_id: initial?.client_id ?? '',
    folder_name: initial?.folder_name ?? '',
    onedrive_url: initial?.onedrive_url ?? '',
    advisor: initial?.advisor ?? '',
    start_date: initial?.start_date ?? new Date().toISOString().split('T')[0],
    opened_date: initial?.opened_date ?? '',
    status: (initial?.status ?? 'nueva_carpeta') as OpeningStatus,
    notes: initial?.notes ?? '',
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
        client_id: form.client_id || null,
        folder_name: form.folder_name.trim(),
        onedrive_url: form.onedrive_url.trim() || null,
        advisor: form.advisor.trim() || null,
        start_date: form.start_date,
        opened_date: form.opened_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      }

      if (mode === 'new') {
        const { data, error: err } = await supabase
          .from('account_openings')
          .insert(payload)
          .select()
          .single()
        if (err) throw err

        const checklistRows = DEFAULT_CHECKLIST.map((title, i) => ({
          opening_id: data.id,
          title,
          sort_order: i,
        }))
        await supabase.from('opening_checklist_items').insert(checklistRows)

        router.push(`/openings/${data.id}`)
      } else {
        const { error: err } = await supabase
          .from('account_openings')
          .update(payload)
          .eq('id', initial!.id!)
        if (err) throw err
        router.push(`/openings/${initial!.id}`)
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de carpeta *</label>
            <input
              required
              value={form.folder_name}
              onChange={(e) => set('folder_name', e.target.value)}
              placeholder="Ej: Juan Pérez — Roble Local"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cliente asociado</label>
            <select value={form.client_id} onChange={(e) => set('client_id', e.target.value)} className={selectClass}>
              <option value="">— Sin asignar —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} ({c.client_number})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Link carpeta OneDrive</label>
            <input
              type="url"
              value={form.onedrive_url}
              onChange={(e) => set('onedrive_url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Proceso</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={selectClass}>
              <option value="nueva_carpeta">Nueva carpeta</option>
              <option value="en_contacto">En contacto</option>
              <option value="documentacion_solicitada">Documentacion solicitada</option>
              <option value="documentacion_recibida">Documentacion recibida</option>
              <option value="formularios_enviados">Formularios enviados</option>
              <option value="formularios_firmados">Formularios firmados</option>
              <option value="en_revision">En revision</option>
              <option value="cuenta_abierta">Cuenta abierta</option>
              <option value="descartada">Descartada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Asesor responsable</label>
            <input
              value={form.advisor}
              onChange={(e) => set('advisor', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de apertura</label>
            <input
              type="date"
              value={form.opened_date}
              onChange={(e) => set('opened_date', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Notas</h2>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className={`${inputClass} resize-none`}
          placeholder="Observaciones del proceso..."
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : mode === 'new' ? 'Iniciar apertura' : 'Guardar cambios'}
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
