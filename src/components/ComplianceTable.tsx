'use client'

import { useState } from 'react'
import Link from 'next/link'

export type DocState = 'falta' | 'pedido' | 'recibido' | 'revisado' | 'vencido'

const DOC_STATE_CONFIG: Record<DocState, { label: string; bg: string; text: string; border: string }> = {
  falta:    { label: 'Falta',    bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
  pedido:   { label: 'Pedido',   bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  recibido: { label: 'Recibido', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  revisado: { label: 'Revisado', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  vencido:  { label: 'Vencido',  bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
}

const DOC_STATE_ORDER: DocState[] = ['falta', 'pedido', 'recibido', 'revisado', 'vencido']
const DONE_STATES: DocState[] = ['recibido', 'revisado']

function nextState(current: DocState): DocState {
  const idx = DOC_STATE_ORDER.indexOf(current)
  return DOC_STATE_ORDER[(idx + 1) % DOC_STATE_ORDER.length]
}

function DocStatePill({ state, onClick }: { state: DocState; onClick: () => void }) {
  const cfg = DOC_STATE_CONFIG[state] ?? DOC_STATE_CONFIG.falta
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-opacity hover:opacity-80 whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border}`}
      title="Clic para cambiar estado"
    >
      {cfg.label}
    </button>
  )
}

interface ComplianceRow {
  client_id: string
  client_number: string
  first_name: string
  last_name: string
  client_type: string
  onedrive_folder_url: string | null
  status: string
  advisor?: string | null
  compliance: {
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
}

interface Props {
  rows: ComplianceRow[]
  fields: { key: string; label: string }[]
}

function ComplianceStatusBadge({ status }: { status: string }) {
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

export default function ComplianceTable({ rows: initialRows, fields }: Props) {
  const [data, setData] = useState<ComplianceRow[]>(initialRows)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all')
  const [creatingTask, setCreatingTask] = useState<string | null>(null)

  async function cycleField(clientId: string, field: string, currentState: DocState) {
    const newState = nextState(currentState)

    // Optimistic update
    setData((prev) =>
      prev.map((row) => {
        if (row.client_id !== clientId) return row
        const updated = { ...row.compliance, [field]: newState }
        const allDone = fields.every((f) => DONE_STATES.includes((updated as Record<string, unknown>)[f.key] as DocState))
        return { ...row, compliance: { ...updated, status: allDone ? 'completo' : 'incompleto' } }
      })
    )

    // API call
    await fetch('/api/compliance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, field, value: newState }),
    })
  }

  async function crearTarea(row: ComplianceRow) {
    const missing = fields.filter(
      (f) => !DONE_STATES.includes((row.compliance as Record<string, unknown>)[f.key] as DocState)
    )
    const missingList = missing.map((f) => f.label).join(', ')
    const title = `Pedir a ${row.first_name} ${row.last_name}: ${missingList}`

    setCreatingTask(row.client_id)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        client_id: row.client_id,
        priority: 'alta',
        status: 'pendiente',
      }),
    })
    setCreatingTask(null)
  }

  const filtered = data.filter((row) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      row.first_name.toLowerCase().includes(q) ||
      row.last_name.toLowerCase().includes(q) ||
      row.client_number.toLowerCase().includes(q) ||
      (row.advisor ?? '').toLowerCase().includes(q)

    const allDone = fields.every((f) =>
      DONE_STATES.includes((row.compliance as Record<string, unknown>)[f.key] as DocState)
    )
    const matchesFilter =
      filter === 'all' ||
      (filter === 'complete' && allDone) ||
      (filter === 'incomplete' && !allDone)

    return matchesSearch && matchesFilter
  })

  return (
    <div>
      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, N° o asesor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A]"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'incomplete', 'complete'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filter === f
                  ? 'bg-[#2D3F52] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'incomplete' ? 'Incompletos' : 'Completos'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-3 flex-wrap">
        <span className="text-xs text-gray-400">Estado de documento:</span>
        {DOC_STATE_ORDER.map((s) => {
          const cfg = DOC_STATE_CONFIG[s]
          return (
            <span key={s} className={`text-[11px] px-2 py-0.5 rounded border font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.label}
            </span>
          )
        })}
        <span className="text-xs text-gray-400 ml-1">(clic para avanzar estado)</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  N. Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Asesor
                </th>
                {fields.map((f) => (
                  <th key={f.key} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={fields.length + 5} className="px-4 py-8 text-center text-sm text-gray-400">
                    Sin resultados.
                  </td>
                </tr>
              )}
              {filtered.map((row) => {
                const comp = row.compliance
                return (
                  <tr key={row.client_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {row.client_number}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${row.client_id}`} className="font-medium text-gray-900 hover:text-[#2D3F52] hover:underline">
                        {row.first_name} {row.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {row.advisor ?? <span className="text-gray-300">—</span>}
                    </td>
                    {fields.map((f) => {
                      const state = ((comp as Record<string, unknown>)[f.key] as DocState) ?? 'falta'
                      return (
                        <td key={f.key} className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <DocStatePill
                              state={state}
                              onClick={() => cycleField(row.client_id, f.key, state)}
                            />
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center">
                      <ComplianceStatusBadge status={comp.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {row.onedrive_folder_url && (
                          <a
                            href={row.onedrive_folder_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            Carpeta
                          </a>
                        )}
                        <button
                          onClick={() => crearTarea(row)}
                          disabled={comp.status === 'completo' || creatingTask === row.client_id}
                          className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          {creatingTask === row.client_id ? 'Creando...' : 'Tarea'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
