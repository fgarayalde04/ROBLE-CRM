'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaxRecord {
  id: string
  tax_name: string
  company: string
  official_link: string | null
  due_date: string | null
  status: 'pendiente' | 'pagado' | 'vencido'
  comment: string | null
  paid_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface Props {
  records: TaxRecord[]
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CYCLE: Record<string, 'pendiente' | 'pagado' | 'vencido'> = {
  pendiente: 'pagado',
  pagado: 'vencido',
  vencido: 'pendiente',
}

const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  pagado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  vencido: 'bg-red-100 text-red-700 border-red-200',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImpuestosTable({ records: initialRecords }: Props) {
  const router = useRouter()
  const [records, setRecords] = useState<TaxRecord[]>(initialRecords)

  // Inline editing state
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Add form state
  const [addingRow, setAddingRow] = useState(false)
  const [newTaxName, setNewTaxName] = useState('')
  const [newCompany, setNewCompany] = useState('roble')
  const [newLink, setNewLink] = useState('')
  const [newComment, setNewComment] = useState('')

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleStatus = useCallback(async (id: string, currentStatus: string) => {
    const newStatus = STATUS_CYCLE[currentStatus] ?? 'pendiente'
    const now = new Date().toISOString()
    setRecords(prev => prev.map(r => r.id === id ? {
      ...r,
      status: newStatus as TaxRecord['status'],
      paid_at: newStatus === 'pagado' ? now : null,
    } : r))
    await fetch('/api/impuestos?action=toggle-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
  }, [])

  const startEdit = useCallback((id: string, field: string, value: string) => {
    setEditing({ id, field })
    setEditValue(value ?? '')
  }, [])

  const commitEdit = useCallback(async (id: string, field: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: editValue || null } : r))
    setEditing(null)
    await fetch('/api/impuestos?action=update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: editValue || null }),
    })
  }, [editValue])

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Eliminar "${name}"?`)) return
    setRecords(prev => prev.filter(r => r.id !== id))
    await fetch('/api/impuestos?action=delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }, [])

  const handleAddRow = useCallback(async () => {
    if (!newTaxName.trim() || !newCompany.trim()) return
    const res = await fetch('/api/impuestos?action=add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tax_name: newTaxName.trim(),
        company: newCompany.trim(),
        official_link: newLink.trim() || undefined,
        comment: newComment.trim() || undefined,
      }),
    })
    if (res.ok) {
      const newRecord = await res.json() as TaxRecord
      setRecords(prev => [...prev, newRecord])
      setNewTaxName('')
      setNewCompany('roble')
      setNewLink('')
      setNewComment('')
      setAddingRow(false)
    }
  }, [newTaxName, newCompany, newLink, newComment])

  // ─── KPI counts ─────────────────────────────────────────────────────────────

  const pendientes = records.filter(r => r.status === 'pendiente').length
  const pagados = records.filter(r => r.status === 'pagado').length
  const vencidos = records.filter(r => r.status === 'vencido').length

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-600 font-medium">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700">{pendientes}</p>
        </div>
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-xs text-emerald-600 font-medium">Pagados</p>
          <p className="text-2xl font-bold text-emerald-700">{pagados}</p>
        </div>
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-600 font-medium">Vencidos</p>
          <p className="text-2xl font-bold text-red-700">{vencidos}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left py-3.5 px-4 text-sm font-bold text-gray-600 uppercase tracking-wide" style={{ minWidth: '380px' }}>
                Impuesto
              </th>
              <th className="text-left py-3.5 px-3 text-sm font-bold text-gray-600 uppercase tracking-wide" style={{ minWidth: '120px' }}>
                Empresa
              </th>
              <th className="text-left py-3.5 px-3 text-sm font-bold text-gray-600 uppercase tracking-wide" style={{ minWidth: '120px' }}>
                Fecha de pago
              </th>
              <th className="text-center py-3.5 px-3 text-sm font-bold text-gray-600 uppercase tracking-wide" style={{ minWidth: '110px' }}>
                Estado
              </th>
              <th className="text-center py-3.5 px-3 text-sm font-bold text-gray-600 uppercase tracking-wide" style={{ minWidth: '80px' }}>
                Link
              </th>
              <th className="w-8 bg-gray-50" />
            </tr>
          </thead>

          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="group border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                {/* Impuesto */}
                <td className="py-2.5 px-4" colSpan={record.comment ? 1 : 1}>
                  {editing?.id === record.id && editing.field === 'tax_name' ? (
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(record.id, 'tax_name')}
                      onKeyDown={e => e.key === 'Enter' && commitEdit(record.id, 'tax_name')}
                      className="px-2 py-0.5 text-sm border border-[#16A34A] rounded focus:outline-none w-full"
                    />
                  ) : (
                    <div>
                      <span
                        className="text-sm font-medium text-[#2D3F52] cursor-pointer hover:text-[#16A34A] transition-colors"
                        onClick={() => startEdit(record.id, 'tax_name', record.tax_name)}
                      >
                        {record.tax_name}
                      </span>
                      {record.comment && (
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{record.comment}</p>
                      )}
                    </div>
                  )}
                </td>

                {/* Empresa */}
                <td className="py-2.5 px-3">
                  {editing?.id === record.id && editing.field === 'company' ? (
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(record.id, 'company')}
                      onKeyDown={e => e.key === 'Enter' && commitEdit(record.id, 'company')}
                      className="px-2 py-0.5 text-sm border border-[#16A34A] rounded focus:outline-none w-full"
                    />
                  ) : (
                    <span
                      className="text-sm text-gray-600 cursor-pointer hover:text-[#16A34A] transition-colors"
                      onClick={() => startEdit(record.id, 'company', record.company)}
                    >
                      {record.company}
                    </span>
                  )}
                </td>

                {/* Fecha de pago */}
                <td className="py-2.5 px-3">
                  {record.paid_at ? (
                    <span className="text-sm font-medium text-emerald-600">
                      {new Date(record.paid_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-sm">—</span>
                  )}
                </td>

                {/* Estado */}
                <td className="py-2.5 px-3 text-center">
                  <button
                    onClick={() => handleToggleStatus(record.id, record.status)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${STATUS_COLORS[record.status]}`}
                    title="Clic para cambiar estado"
                  >
                    {record.status}
                  </button>
                </td>


                {/* Link */}
                <td className="py-2.5 px-3 text-center">
                  {record.official_link ? (
                    <a
                      href={record.official_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[#16A34A] hover:underline"
                    >
                      Abrir
                    </a>
                  ) : (
                    <span
                      className="text-xs text-gray-300 cursor-pointer hover:text-gray-400"
                      onClick={() => startEdit(record.id, 'official_link', record.official_link ?? '')}
                    >
                      —
                    </span>
                  )}
                </td>

                {/* Delete */}
                <td className="py-2.5 px-2">
                  <button
                    onClick={() => handleDelete(record.id, record.tax_name)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all text-base leading-none"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row form */}
      {addingRow ? (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <h4 className="text-sm font-semibold text-[#2D3F52]">Nuevo impuesto</h4>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Nombre (ej: BPS)"
              value={newTaxName}
              onChange={e => setNewTaxName(e.target.value)}
              autoFocus
              className="px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] flex-1 min-w-32"
            />
            <input
              type="text"
              placeholder="Empresa"
              value={newCompany}
              onChange={e => setNewCompany(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] w-32"
            />
            <input
              type="text"
              placeholder="Link oficial"
              value={newLink}
              onChange={e => setNewLink(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] flex-1 min-w-48"
            />
            <input
              type="text"
              placeholder="Comentario"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#16A34A] flex-1 min-w-32"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddRow}
              className="px-4 py-2 text-sm font-medium text-white rounded transition-colors"
              style={{ backgroundColor: '#2D3F52' }}
            >
              Agregar
            </button>
            <button
              onClick={() => setAddingRow(false)}
              className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingRow(true)}
          className="text-sm text-gray-400 hover:text-[#2D3F52] transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none">+</span> Agregar impuesto
        </button>
      )}
    </div>
  )
}
