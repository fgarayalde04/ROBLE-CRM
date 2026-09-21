'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Mismos campos y criterio que la sección Legajos de Banco Central
// (banco_central_records) — esta ficha es una vista de esos legajos.
const FIELDS = [
  { key: 'ficha',              label: 'Ficha cliente' },
  { key: 'lista_verificacion', label: 'Lista verif.' },
  { key: 'cuestionario',       label: 'Cuest. asesor' },
  { key: 'ci',                 label: 'Cédula' },
  { key: 'cumplo',             label: 'Cumplo' },
  { key: 'documentos_legales', label: 'Docs legales (sociedad)' },
] as const

type FieldKey = typeof FIELDS[number]['key']

const REQUIRED_FIELDS: FieldKey[] = ['ficha', 'lista_verificacion', 'cuestionario', 'ci', 'cumplo']

interface Legajo {
  id: string
  type: 'local' | 'internacional'
  customer_number: string | null
  folder_name: string | null
  status: string
  updated_at: string | null
  ficha: boolean
  lista_verificacion: boolean
  cuestionario: boolean
  ci: boolean
  cumplo: boolean
  documentos_legales: boolean
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completo') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-emerald-700 bg-emerald-50 border-emerald-200">
        Completo
      </span>
    )
  }
  if (status === 'cerrada') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-gray-600 bg-gray-100 border-gray-300">
        Cerrada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-amber-700 bg-amber-50 border-amber-200">
      Incompleto
    </span>
  )
}

export default function ComplianceBlock({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [legajos, setLegajos] = useState<Legajo[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingTask, setCreatingTask] = useState(false)

  useEffect(() => {
    fetch(`/api/banco-central?client_id=${clientId}`)
      .then((r) => r.json())
      .then((data) => { setLegajos(data.records ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function toggle(legajo: Legajo, field: FieldKey) {
    const value = !legajo[field]
    const merged = { ...legajo, [field]: value }
    const newStatus = legajo.status === 'cerrada'
      ? 'cerrada'
      : REQUIRED_FIELDS.every((f) => merged[f]) ? 'completo' : 'incompleto'

    setLegajos((prev) => prev.map((l) => (l.id === legajo.id ? { ...merged, status: newStatus } : l)))

    const res = await fetch('/api/banco-central', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: legajo.id, field, value }),
    })
    if (!res.ok) {
      setLegajos((prev) => prev.map((l) => (l.id === legajo.id ? legajo : l)))
    }
  }

  async function crearTarea(legajo: Legajo) {
    const missing = FIELDS.filter((f) => REQUIRED_FIELDS.includes(f.key) && !legajo[f.key])
    if (missing.length === 0) return
    const title = `Pedir a ${clientName ?? legajo.folder_name ?? 'cliente'}: ${missing.map((f) => f.label).join(', ')}`

    setCreatingTask(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, client_id: clientId, priority: 'alta', status: 'pendiente' }),
    })
    setCreatingTask(false)
  }

  const heading = (
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
      Documentacion Banco Central
    </h3>
  )

  if (loading) {
    return (
      <div>
        <div className="mb-3">{heading}</div>
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    )
  }

  if (legajos.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          {heading}
          <Link href="/banco-central" className="text-xs text-[#2D3F52] hover:underline font-medium">
            Ver en Banco Central
          </Link>
        </div>
        <p className="text-sm text-gray-400">Este cliente no tiene legajo en Banco Central.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {legajos.map((legajo) => {
        const cerrada = legajo.status === 'cerrada'
        return (
          <div key={legajo.id}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {heading}
                {legajos.length > 1 && (
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    {legajo.type === 'internacional' ? 'Internacional' : 'Local'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={legajo.status} />
                <Link
                  href={`/banco-central?tab=${legajo.type}${legajo.customer_number ? `&q=${encodeURIComponent(legajo.customer_number)}` : ''}`}
                  className="text-xs text-[#2D3F52] hover:underline font-medium"
                >
                  Ver en Banco Central
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {FIELDS.map((f) => {
                const done = legajo[f.key]
                return (
                  <button
                    key={f.key}
                    onClick={() => toggle(legajo, f.key)}
                    title="Clic para tildar / destildar"
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded border text-left transition-colors ${
                      done
                        ? 'bg-emerald-50 border-emerald-300'
                        : 'bg-gray-50 border-gray-200 hover:border-[#16A34A]/60'
                    }`}
                  >
                    <span className={`text-xs font-medium ${done ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {f.label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      done
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}>
                      {done ? '✓' : 'Falta'}
                    </span>
                  </button>
                )
              })}
            </div>

            {legajo.status === 'incompleto' && (
              <button
                onClick={() => crearTarea(legajo)}
                disabled={creatingTask}
                className="text-xs font-medium bg-[#2D3F52] text-white px-3 py-1.5 rounded hover:bg-[#354A5E] disabled:opacity-50 transition-colors"
              >
                {creatingTask ? 'Creando tarea...' : 'Crear tarea por faltantes'}
              </button>
            )}

            {cerrada && <p className="text-xs text-gray-400">Legajo cerrado.</p>}

            {legajo.updated_at && (
              <p className="mt-3 text-xs text-gray-400">
                Actualizado:{' '}
                {new Date(legajo.updated_at).toLocaleDateString('es-UY', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                })}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
