'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clientId: string
  clientName: string
  isClosed: boolean
  closedAt?: string | null
  closedBy?: string | null
  closeReason?: string | null
}

export default function ClientStatusToggle({
  clientId, clientName, isClosed, closedAt, closedBy, closeReason
}: Props) {
  const router = useRouter()
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [author, setAuthor] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('crm_username') ?? ''
    return ''
  })

  async function handleClose() {
    if (!author.trim()) return
    setSaving(true)
    if (author) localStorage.setItem('crm_username', author)
    await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: clientId,
        status: 'cerrado',
        closed_at: new Date().toISOString(),
        closed_by: author.trim(),
        close_reason: reason.trim() || null,
      }),
    })
    setSaving(false)
    setShowCloseModal(false)
    router.refresh()
  }

  async function handleReopen() {
    setSaving(true)
    await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: clientId,
        status: 'activo',
        closed_at: null,
        closed_by: null,
        close_reason: null,
      }),
    })
    setSaving(false)
    setShowReopenModal(false)
    router.refresh()
  }

  return (
    <>
      {isClosed ? (
        <button
          onClick={() => setShowReopenModal(true)}
          title="Clic para reabrir"
          className="group relative text-[11px] font-medium px-2 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-200 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors cursor-pointer"
        >
          Cerrado
          <span className="hidden group-hover:inline ml-1 text-[10px] opacity-70">↩ reabrir</span>
        </button>
      ) : (
        <button
          onClick={() => setShowCloseModal(true)}
          title="Clic para cerrar cliente"
          className="group relative text-[11px] font-medium px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer"
        >
          <span className="group-hover:hidden">Activo</span>
          <span className="hidden group-hover:inline">Cerrar ×</span>
        </button>
      )}

      {/* Modal cierre */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowCloseModal(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Cerrar cliente</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{clientName}</span> dejará de aparecer en listas activas y métricas. No se borran datos.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tu nombre <span className="text-red-400">*</span></label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Francisco, Sandra, Guillermo..."
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motivo <span className="text-gray-400">(opcional)</span></label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Ej: Cliente solicitó cierre, cuenta migrada, etc."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowCloseModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={saving || !author.trim()}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {saving ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reabrir */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowReopenModal(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Reabrir cliente</h2>
            <p className="text-sm text-gray-500 mb-1">
              ¿Volvés a activar a <span className="font-medium text-gray-700">{clientName}</span>?
            </p>
            {closedAt && (
              <p className="text-xs text-gray-400 mb-4">
                Cerrado el {new Date(closedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                {closedBy ? ` por ${closedBy}` : ''}
                {closeReason ? ` · "${closeReason}"` : ''}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReopenModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleReopen}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {saving ? 'Reabriendo...' : 'Reabrir cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
