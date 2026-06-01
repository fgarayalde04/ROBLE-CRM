'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, TaskPriority, TaskStatus } from '@/types/platform'
import ClientSearchInput from '@/components/ClientSearchInput'

type TeamMember = { id: string; name: string }

interface Props {
  initial?: Partial<Task>
  mode: 'new' | 'edit'
  preselectedClientId?: string
  preselectedOpeningId?: string
}

export default function TaskForm({
  initial,
  mode,
  preselectedClientId,
  preselectedOpeningId,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [sharedWith, setSharedWith] = useState<string[]>([])

  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    client_id: initial?.client_id ?? preselectedClientId ?? '',
    responsible: initial?.responsible ?? '',
    priority: (initial?.priority ?? 'media') as TaskPriority,
    status: (initial?.status ?? 'pendiente') as TaskStatus,
    due_date: initial?.due_date ?? '',
    notes: initial?.notes ?? '',
  })

  useEffect(() => {
    fetch('/api/team-members')
      .then((r) => r.json())
      .then((data) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => setTeamMembers([]))
  }, [])

  function set(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  function toggleSharedUser(name: string) {
    setSharedWith((prev) =>
      prev.includes(name) ? prev.filter((u) => u !== name) : [...prev, name]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        client_id: form.client_id || null,
        responsible: form.responsible.trim() || null,
        priority: form.priority,
        status: form.status,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        shared_with: sharedWith,
      }
      if (preselectedOpeningId) payload.opening_id = preselectedOpeningId

      if (mode === 'new') {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al crear tarea')
      } else {
        const res = await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: initial!.id, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al actualizar tarea')
      }

      router.push('/tasks')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Tarea</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Titulo *" span={2}>
            <input
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Descripcion" span={2}>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>
          <Field label="Cliente">
            <ClientSearchInput
              value={form.client_id}
              onChange={(id) => set('client_id', id)}
              placeholder="Buscar por nombre o número..."
            />
          </Field>
          <Field label="Responsable">
            <input
              value={form.responsible}
              onChange={(e) => set('responsible', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Prioridad">
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className={selectClass}
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </Field>
          <Field label="Estado">
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              className={selectClass}
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="bloqueado">Bloqueado</option>
              <option value="completado">Completado</option>
            </select>
          </Field>
          <Field label="Fecha limite">
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Compartir con" span={2}>
            {teamMembers.length === 0 ? (
              <p className="text-xs text-gray-400">No hay usuarios cargados para compartir.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teamMembers.map((member) => {
                  const disabled = member.name === form.responsible.trim()
                  return (
                    <label
                      key={member.id}
                      className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${
                        disabled
                          ? 'border-gray-100 bg-gray-50 text-gray-300'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#16A34A]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sharedWith.includes(member.name)}
                        disabled={disabled}
                        onChange={() => toggleSharedUser(member.name)}
                        className="h-4 w-4 rounded border-gray-300 text-[#16A34A] focus:ring-[#16A34A]"
                      />
                      <span>{member.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Notas</h2>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Guardando...' : mode === 'new' ? 'Crear tarea' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
  span,
}: {
  label: string
  children: React.ReactNode
  span?: number
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] bg-white text-gray-900 placeholder:text-gray-300'
const selectClass =
  'w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] bg-white text-gray-900'
