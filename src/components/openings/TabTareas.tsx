'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpeningTask } from '@/types/platform'

interface Props {
  tasks: OpeningTask[]
  openingId: string
}

const TASK_STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600 border-gray-200',
  en_proceso: 'bg-blue-50 text-blue-700 border-blue-200',
  bloqueada: 'bg-red-50 text-red-600 border-red-200',
  completada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
}

const PRIORITY_COLORS: Record<string, string> = {
  baja: 'bg-gray-100 text-gray-500 border-gray-200',
  normal: 'bg-gray-100 text-gray-600 border-gray-200',
  alta: 'bg-amber-50 text-amber-700 border-amber-200',
  urgente: 'bg-red-50 text-red-600 border-red-200',
}

const PRIORITY_LABELS: Record<string, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  responsible: '',
  due_date: '',
  priority: 'normal',
  status: 'pendiente',
}

export default function TabTareas({ tasks: initialTasks, openingId }: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState<OpeningTask[]>(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [editData, setEditData] = useState<Record<string, Partial<OpeningTask>>>({})
  const [error, setError] = useState<string | null>(null)

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getEdit(task: OpeningTask): Partial<OpeningTask> {
    return editData[task.id] ?? {
      title: task.title,
      description: task.description,
      responsible: task.responsible,
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
    }
  }

  async function handleAdd() {
    if (!form.title.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/openings/${openingId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          responsible: form.responsible.trim() || null,
          due_date: form.due_date || null,
          priority: form.priority,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Error al crear')
      }
      const created = await res.json()
      setTasks((prev) => [created, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(task: OpeningTask) {
    const edit = getEdit(task)
    setUpdating((prev) => new Set(prev).add(task.id))

    try {
      const res = await fetch(`/api/openings/${openingId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...edit }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      router.refresh()
    } catch {
      // handle silently
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  async function handleComplete(task: OpeningTask) {
    const newStatus = task.status === 'completada' ? 'pendiente' : 'completada'
    setUpdating((prev) => new Set(prev).add(task.id))

    try {
      const res = await fetch(`/api/openings/${openingId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      router.refresh()
    } catch {
      // handle silently
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  const pendingCount = tasks.filter((t) => t.status !== 'completada').length

  return (
    <div className="space-y-5">
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Tareas</h2>
          <p className="text-xs text-gray-400 mt-0.5">{pendingCount} pendientes de {tasks.length}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {showForm ? 'Cancelar' : 'Nueva tarea'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Nueva tarea</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Titulo de la tarea *"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descripcion (opcional)"
              rows={2}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Responsable</label>
                <input
                  type="text"
                  value={form.responsible}
                  onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))}
                  placeholder="Nombre"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Vencimiento</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Prioridad</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
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
                  <option value="en_proceso">En proceso</option>
                  <option value="bloqueada">Bloqueada</option>
                  <option value="completada">Completada</option>
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={submitting || !form.title.trim()}
                className="px-4 py-2 text-sm rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Guardando...' : 'Crear tarea'}
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

      {/* Task list */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {tasks.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No hay tareas registradas.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tasks.map((task) => {
              const isExpanded = expanded.has(task.id)
              const isUpdating = updating.has(task.id)
              const edit = getEdit(task)

              return (
                <div key={task.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={task.status === 'completada'}
                      onChange={() => handleComplete(task)}
                      disabled={isUpdating}
                      className="w-4 h-4 accent-[#16A34A] cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'completada' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TASK_STATUS_COLORS[task.status]}`}>
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        {task.priority !== 'normal' && task.priority !== 'baja' && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        )}
                        {task.responsible && (
                          <span className="text-[10px] text-gray-400">{task.responsible}</span>
                        )}
                        {task.due_date && (
                          <span className="text-[10px] text-gray-400">
                            Vence: {new Date(task.due_date + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleExpand(task.id)}
                      className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0 transition-colors"
                    >
                      {isExpanded ? 'cerrar' : 'editar'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-50 px-4 py-4 bg-gray-50/50 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Titulo</label>
                          <input
                            type="text"
                            value={(edit.title ?? '') as string}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [task.id]: { ...getEdit(task), title: e.target.value } }))}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Responsable</label>
                          <input
                            type="text"
                            value={(edit.responsible ?? '') as string}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [task.id]: { ...getEdit(task), responsible: e.target.value } }))}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Estado</label>
                          <select
                            value={(edit.status ?? task.status) as string}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [task.id]: { ...getEdit(task), status: e.target.value as OpeningTask['status'] } }))}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="en_proceso">En proceso</option>
                            <option value="bloqueada">Bloqueada</option>
                            <option value="completada">Completada</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Prioridad</label>
                          <select
                            value={(edit.priority ?? task.priority) as string}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [task.id]: { ...getEdit(task), priority: e.target.value as OpeningTask['priority'] } }))}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="baja">Baja</option>
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Vencimiento</label>
                          <input
                            type="date"
                            value={(edit.due_date ?? '') as string}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [task.id]: { ...getEdit(task), due_date: e.target.value || null } }))}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
                      )}
                      <button
                        onClick={() => handleUpdate(task)}
                        disabled={isUpdating}
                        className="px-3 py-1.5 text-xs rounded bg-[#2D3F52] text-white hover:bg-[#354A5E] disabled:opacity-40 transition-colors"
                      >
                        {isUpdating ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
