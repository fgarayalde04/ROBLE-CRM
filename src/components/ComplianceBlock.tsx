'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DocState } from './ComplianceTable'

const FIELDS = [
  { key: 'ficha_cliente',       label: 'Ficha' },
  { key: 'perfil_inversor',     label: 'Perfil inversor' },
  { key: 'cedula',              label: 'Cedula' },
  { key: 'documentos_legales',  label: 'Docs legales' },
  { key: 'cuestionario_asesor', label: 'Cuestionario' },
] as const

type FieldKey = typeof FIELDS[number]['key']

const DOC_STATE_ORDER: DocState[] = ['falta', 'pedido', 'recibido', 'revisado', 'vencido']
const DONE_STATES: DocState[] = ['recibido', 'revisado']

const DOC_STATE_CONFIG: Record<DocState, { label: string; activeBg: string; activeText: string; activeBorder: string }> = {
  falta:    { label: 'Falta',    activeBg: 'bg-gray-100',   activeText: 'text-gray-600',   activeBorder: 'border-gray-300' },
  pedido:   { label: 'Pedido',   activeBg: 'bg-amber-50',   activeText: 'text-amber-700',  activeBorder: 'border-amber-300' },
  recibido: { label: 'Recibido', activeBg: 'bg-blue-50',    activeText: 'text-blue-700',   activeBorder: 'border-blue-300' },
  revisado: { label: 'Revisado', activeBg: 'bg-emerald-50', activeText: 'text-emerald-700', activeBorder: 'border-emerald-300' },
  vencido:  { label: 'Vencido',  activeBg: 'bg-red-50',     activeText: 'text-red-700',    activeBorder: 'border-red-300' },
}

function nextState(current: DocState): DocState {
  const idx = DOC_STATE_ORDER.indexOf(current)
  return DOC_STATE_ORDER[(idx + 1) % DOC_STATE_ORDER.length]
}

interface ComplianceData {
  id: string | null
  ficha_cliente: DocState
  perfil_inversor: DocState
  cedula: DocState
  documentos_legales: DocState
  cuestionario_asesor: DocState
  status: string
  updated_at: string | null
  updated_by: string | null
}

interface ClientRow {
  client_id: string
  first_name: string
  last_name: string
  compliance: ComplianceData
}

const DEFAULT_COMPLIANCE: ComplianceData = {
  id: null,
  ficha_cliente: 'falta',
  perfil_inversor: 'falta',
  cedula: 'falta',
  documentos_legales: 'falta',
  cuestionario_asesor: 'falta',
  status: 'incompleto',
  updated_at: null,
  updated_by: null,
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completo') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-emerald-700 bg-emerald-50 border-emerald-200">
        Completo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-amber-700 bg-amber-50 border-amber-200">
      Incompleto
    </span>
  )
}

export default function ComplianceBlock({ clientId }: { clientId: string }) {
  const [row, setRow] = useState<ClientRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingTask, setCreatingTask] = useState(false)

  useEffect(() => {
    fetch(`/api/compliance?client_id=${clientId}`)
      .then((r) => r.json())
      .then((data) => { setRow(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function cycleField(field: FieldKey, currentState: DocState) {
    if (!row) return
    const newState = nextState(currentState)

    // Optimistic update
    const updated = { ...row.compliance, [field]: newState }
    const allDone = FIELDS.every((f) => DONE_STATES.includes(updated[f.key]))
    setRow({ ...row, compliance: { ...updated, status: allDone ? 'completo' : 'incompleto' } })

    await fetch('/api/compliance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, field, value: newState }),
    })
  }

  async function crearTarea() {
    if (!row) return
    const missing = FIELDS.filter((f) => !DONE_STATES.includes(row.compliance[f.key]))
    if (missing.length === 0) return
    const missingList = missing.map((f) => f.label).join(', ')
    const title = `Pedir a ${row.first_name} ${row.last_name}: ${missingList}`

    setCreatingTask(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, client_id: clientId, priority: 'alta', status: 'pendiente' }),
    })
    setCreatingTask(false)
  }

  if (loading) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Documentacion Banco Central
        </h3>
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    )
  }

  const compliance = row?.compliance ?? DEFAULT_COMPLIANCE

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          Documentacion Banco Central
        </h3>
        <div className="flex items-center gap-3">
          <StatusBadge status={compliance.status} />
          <Link href="/banco-central" className="text-xs text-[#2D3F52] hover:underline font-medium">
            Ver en Banco Central
          </Link>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {FIELDS.map((f) => {
          const state = compliance[f.key]
          const cfg = DOC_STATE_CONFIG[state] ?? DOC_STATE_CONFIG.falta
          const isDone = DONE_STATES.includes(state)
          return (
            <button
              key={f.key}
              onClick={() => cycleField(f.key, state)}
              title="Clic para avanzar estado"
              className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded border text-left transition-colors ${
                isDone
                  ? `${cfg.activeBg} ${cfg.activeBorder}`
                  : 'bg-gray-50 border-gray-200 hover:border-[#16A34A]/60'
              }`}
            >
              <span className={`text-xs font-medium ${isDone ? cfg.activeText : 'text-gray-500'}`}>
                {f.label}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.activeBg} ${cfg.activeText} ${cfg.activeBorder}`}>
                {cfg.label}
              </span>
            </button>
          )
        })}
      </div>

      {compliance.status !== 'completo' && (
        <button
          onClick={crearTarea}
          disabled={creatingTask}
          className="text-xs font-medium bg-[#2D3F52] text-white px-3 py-1.5 rounded hover:bg-[#354A5E] disabled:opacity-50 transition-colors"
        >
          {creatingTask ? 'Creando tarea...' : 'Crear tarea por faltantes'}
        </button>
      )}

      {compliance.updated_at && (
        <p className="mt-3 text-xs text-gray-400">
          Actualizado:{' '}
          {new Date(compliance.updated_at).toLocaleDateString('es-UY', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
          {compliance.updated_by && ` por ${compliance.updated_by}`}
        </p>
      )}
    </div>
  )
}
