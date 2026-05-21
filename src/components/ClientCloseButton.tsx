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

export default function ClientCloseButton({
  clientId, clientName, isClosed, closedAt, closedBy, closeReason
}: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
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
    setShowModal(false)
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
    router.refresh()
  }

  if (isClosed) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-500">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <div>
            <p className="font-medium text-gray-600 text-xs">Cuenta cerrada</p>
            {closedAt && <p className="text-[11px] text-gray-400">{new Date(closedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}{closedBy ? ` · ${closedBy}` : ''}</p>}
            {closeReason && <p className="text-[11px] text-gray-400 italic mt-0.5">"{closeReason}"</p>}
          </div>
        </div>
        <button
          onClick={handleReopen}
          disabled={saving}
          className="text-xs text-emerald-600 hover:text-emerald-700 underline underline-offset-2 transition-colors disabled:opacity-40 text-left"
        >
          {saving ? 'Reabriendo...' : 'Reabrir cliente'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors border border-transparent hover:border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        Cerrar cliente
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Cerrar cliente</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{clientName}</span> dejará de aparecer en listas activas, métricas y dashboards. No se borran datos.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tu nombre <span className="text-red-400">*</span></label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Francisco, Sandra, Guillermo..."
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
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
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
    </>
  )
}
