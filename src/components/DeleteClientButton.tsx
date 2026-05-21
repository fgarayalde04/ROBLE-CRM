'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clientId: string
  clientName: string
  /** Si es true, después de eliminar redirige a /clients en lugar de hacer refresh */
  redirectAfter?: boolean
  /** Estilo compacto para usar en tablas */
  compact?: boolean
}

export default function DeleteClientButton({ clientId, clientName, redirectAfter = false, compact = false }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const nameMatches = confirmName.trim().toLowerCase() === clientName.trim().toLowerCase()

  async function handleDelete() {
    if (!nameMatches) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar')
      setShowModal(false)
      if (redirectAfter) {
        router.push('/clients')
      } else {
        router.refresh()
      }
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  return (
    <>
      {compact ? (
        <button
          onClick={() => { setShowModal(true); setConfirmName('') }}
          title="Eliminar cliente"
          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => { setShowModal(true); setConfirmName('') }}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Eliminar cliente
        </button>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            {/* Warning icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Eliminar cliente permanentemente</h2>
                <p className="text-xs text-red-500 font-medium mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Se eliminará el registro de <span className="font-semibold text-gray-800">{clientName}</span> y todos sus datos asociados (tareas, documentos, vencimientos).
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              <p className="text-xs text-amber-700">
                💡 Si solo querés ocultarlo, mejor usá <strong>"Cerrar cliente"</strong> — los datos quedan guardados.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Escribí el nombre del cliente para confirmar:
                <span className="ml-1 font-semibold text-gray-800">{clientName}</span>
              </label>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={clientName}
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400"
              />
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}

            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !nameMatches}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
