'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpeningDocument } from '@/types/platform'

interface Props {
  documents: OpeningDocument[]
  openingId: string
}

const DOC_STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600 border-gray-200',
  recibido: 'bg-blue-50 text-blue-700 border-blue-200',
  aprobado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazado: 'bg-red-50 text-red-600 border-red-200',
}

const DOC_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  recibido: 'Recibido',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

const CATEGORIES = [
  'cedula',
  'pasaporte',
  'comprobante_domicilio',
  'perfil_riesgo',
  'formulario_apertura',
  'contrato',
  'declaracion_jurada',
  'otro',
]

const CATEGORY_LABELS: Record<string, string> = {
  cedula: 'Cedula',
  pasaporte: 'Pasaporte',
  comprobante_domicilio: 'Comprobante de domicilio',
  perfil_riesgo: 'Perfil de riesgo',
  formulario_apertura: 'Formulario de apertura',
  contrato: 'Contrato',
  declaracion_jurada: 'Declaracion jurada',
  otro: 'Otro',
}

const EMPTY_FORM = {
  name: '',
  category: '',
  link: '',
  status: 'pendiente',
  expiry_date: '',
  notes: '',
}

export default function TabDocumentos({ documents: initialDocs, openingId }: Props) {
  const router = useRouter()
  const [docs, setDocs] = useState<OpeningDocument[]>(initialDocs)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/openings/${openingId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category || null,
          link: form.link.trim() || null,
          status: form.status,
          expiry_date: form.expiry_date || null,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Error al guardar')
      }
      const created = await res.json()
      setDocs((prev) => [created, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(doc: OpeningDocument, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(doc.id))

    try {
      const res = await fetch(`/api/openings/${openingId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, status: newStatus }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? updated : d)))
      router.refresh()
    } catch {
      // handle silently
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(doc.id)
        return next
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Documentos</h2>
          <p className="text-xs text-gray-400 mt-0.5">{docs.length} registrados</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {showForm ? 'Cancelar' : 'Agregar documento'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Nuevo documento</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del documento *"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Sin categoria</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="recibido">Recibido</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Link</label>
                <input
                  type="url"
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://..."
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Vencimiento</label>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notas (opcional)"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={submitting || !form.name.trim()}
                className="px-4 py-2 text-sm rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Guardando...' : 'Agregar'}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null) }}
                className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {docs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No hay documentos registrados.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimiento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Link</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{doc.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {doc.category ? (CATEGORY_LABELS[doc.category] ?? doc.category) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={doc.status}
                      onChange={(e) => handleStatusChange(doc, e.target.value)}
                      disabled={updating.has(doc.id)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded border appearance-none cursor-pointer ${DOC_STATUS_COLORS[doc.status]}`}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="recibido">Recibido</option>
                      <option value="aprobado">Aprobado</option>
                      <option value="rechazado">Rechazado</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {doc.expiry_date
                      ? new Date(doc.expiry_date + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {doc.link ? (
                      <a href={doc.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[120px] inline-block">
                        Ver
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                    {doc.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
