'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

const inputClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-300'
const selectClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900'

export default function NewFolderForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    folder_name: '',
    onedrive_url: '',
    detected_at: new Date().toISOString().split('T')[0],
    status: 'pendiente',
    notes: '',
  })

  function set(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('new_folders').insert({
        folder_name: form.folder_name.trim(),
        onedrive_url: form.onedrive_url.trim() || null,
        detected_at: form.detected_at,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      if (err) throw err
      router.push('/folders')
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
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Datos de la carpeta</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de carpeta *</label>
            <input
              required
              value={form.folder_name}
              onChange={(e) => set('folder_name', e.target.value)}
              placeholder="Ej: Juan Pérez — Roble Local"
              className={inputClass}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Link OneDrive</label>
            <input
              type="url"
              value={form.onedrive_url}
              onChange={(e) => set('onedrive_url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha detectada</label>
            <input
              type="date"
              value={form.detected_at}
              onChange={(e) => set('detected_at', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={selectClass}>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="ignorada">Ignorada</option>
              <option value="archivada">Archivada</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Observaciones opcionales..."
            />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : 'Agregar carpeta'}
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
