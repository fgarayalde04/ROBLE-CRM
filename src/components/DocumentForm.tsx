'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Document, DocumentCategory, DocumentStatus } from '@/types/platform'
import ClientSearchInput from '@/components/ClientSearchInput'

interface Props {
  initial?: Partial<Document>
  mode: 'new' | 'edit'
  preselectedClientId?: string
}

export default function DocumentForm({ initial, mode, preselectedClientId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    client_id: initial?.client_id ?? preselectedClientId ?? '',
    category: (initial?.category ?? 'otro') as DocumentCategory,
    onedrive_url: initial?.onedrive_url ?? '',
    status: (initial?.status ?? 'pendiente') as DocumentStatus,
    document_date: initial?.document_date ?? '',
    expiry_date: initial?.expiry_date ?? '',
    responsible: initial?.responsible ?? '',
    tags: (initial?.tags ?? []).join(', '),
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
        name: form.name.trim(),
        client_id: form.client_id || null,
        category: form.category,
        onedrive_url: form.onedrive_url.trim() || null,
        status: form.status,
        document_date: form.document_date || null,
        expiry_date: form.expiry_date || null,
        responsible: form.responsible.trim() || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        notes: form.notes.trim() || null,
      }

      if (mode === 'new') {
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al crear documento')
        router.push('/documents')
      } else {
        const res = await fetch('/api/documents', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: initial!.id!, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al actualizar documento')
        router.push('/documents')
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
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Documento</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre *" span={2}>
            <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Cliente">
            <ClientSearchInput
              value={form.client_id}
              onChange={(id) => set('client_id', id)}
              placeholder="Buscar por nombre o número..."
            />
          </Field>
          <Field label="Categoría">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={selectClass}>
              <option value="contrato">Contrato</option>
              <option value="perfil_riesgo">Perfil de riesgo</option>
              <option value="reporte">Reporte</option>
              <option value="propuesta">Propuesta</option>
              <option value="documento_legal">Documento legal</option>
              <option value="fact_sheet">Fact sheet</option>
              <option value="comunicacion">Comunicación</option>
              <option value="formulario">Formulario</option>
              <option value="analisis_inversion">Análisis de inversión</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          <Field label="Estado">
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={selectClass}>
              <option value="pendiente">Pendiente</option>
              <option value="revisar">Revisar</option>
              <option value="completo">Completo</option>
              <option value="enviado">Enviado</option>
              <option value="firmado">Firmado</option>
              <option value="vencido">Vencido</option>
            </select>
          </Field>
          <Field label="Responsable">
            <input value={form.responsible} onChange={(e) => set('responsible', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Fechas</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha del documento">
            <input type="date" value={form.document_date} onChange={(e) => set('document_date', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Fecha de vencimiento">
            <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Archivo OneDrive</h2>
        <Field label="Link del archivo" span={2}>
          <input
            type="url"
            value={form.onedrive_url}
            onChange={(e) => set('onedrive_url', e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        {form.onedrive_url && (
          <a href={form.onedrive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
            Probar link
          </a>
        )}
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Etiquetas y notas</h2>
        <Field label="Etiquetas (separadas por coma)">
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Ej: urgente, 2025, firma" className={inputClass} />
        </Field>
        <Field label="Notas">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : mode === 'new' ? 'Crear documento' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={() => router.back()} className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-300'
const selectClass = 'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900'
