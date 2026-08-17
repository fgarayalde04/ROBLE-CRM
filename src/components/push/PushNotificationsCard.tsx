'use client'

import { useEffect, useState } from 'react'
import {
  getPushState, enablePush, disablePush, sendTestPush, isIOS, isStandalone,
  type NotificationPermissionState,
} from '@/lib/push/client'

const STATE_LABEL: Record<NotificationPermissionState, { label: string; color: string; dot: string }> = {
  unsupported: { label: 'No soportadas en este navegador', color: 'text-gray-400', dot: 'bg-gray-300' },
  default:     { label: 'No configuradas',                 color: 'text-gray-500', dot: 'bg-gray-300' },
  denied:      { label: 'Bloqueadas por el navegador',      color: 'text-red-600',  dot: 'bg-red-400'  },
  granted:     { label: 'Permiso otorgado — falta activar', color: 'text-amber-600',dot: 'bg-amber-400'},
  subscribed:  { label: 'Activadas en este dispositivo',    color: 'text-emerald-700', dot: 'bg-emerald-500' },
}

export default function PushNotificationsCard() {
  const [state, setState] = useState<NotificationPermissionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    getPushState().then(setState)
    setShowIOSHelp(isIOS() && !isStandalone())
  }, [])

  async function refresh() {
    setState(await getPushState())
  }

  async function handleEnable() {
    setBusy(true); setError(null)
    const res = await enablePush()
    if (!res.ok) setError(res.error)
    await refresh()
    setBusy(false)
  }

  async function handleDisable() {
    setBusy(true); setError(null)
    await disablePush()
    await refresh()
    setBusy(false)
  }

  async function handleTest() {
    setTestStatus('sending')
    const res = await sendTestPush()
    setTestStatus(res.ok ? 'sent' : 'error')
    if (!res.ok) setError(res.error)
    setTimeout(() => setTestStatus('idle'), 4000)
  }

  if (state === null) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Notificaciones</h2>
        <p className="text-xs text-gray-400">Cargando…</p>
      </div>
    )
  }

  const cfg = STATE_LABEL[state]
  const canActivate = state === 'default' || state === 'granted'
  const isSubscribed = state === 'subscribed'

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
      <div className="flex items-center gap-2 mb-1">
        <BellIcon />
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Notificaciones</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">Notificaciones en este dispositivo</p>

      {/* iOS install hint — only when not already installed to home screen */}
      {showIOSHelp && (
        <div className="mb-4 p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-2">
            Para recibir notificaciones en iPhone, agregá Roble a la pantalla de inicio.
          </p>
          <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
            <li>Abrí Roble en Safari.</li>
            <li>Presioná Compartir.</li>
            <li>Seleccioná &ldquo;Agregar a pantalla de inicio&rdquo;.</li>
            <li>Abrí Roble desde el nuevo ícono.</li>
            <li>Activá notificaciones desde Configuración.</li>
          </ol>
        </div>
      )}

      {/* Status row */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
      </div>

      {state === 'denied' && (
        <p className="text-xs text-gray-500 mb-4">
          Las notificaciones están bloqueadas para este sitio. Para activarlas, habilitalas desde la configuración
          de notificaciones del navegador o del sistema operativo, y volvé a esta página.
        </p>
      )}

      {isSubscribed && (
        <p className="text-xs text-emerald-700 mb-4">✓ Notificaciones activadas en este dispositivo</p>
      )}

      {error && (
        <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      {/* Actions */}
      {!showIOSHelp && (
        <div className="flex flex-wrap items-center gap-3">
          {canActivate && (
            <button
              onClick={handleEnable}
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#1B2E3C' }}
            >
              {busy ? 'Activando…' : 'Activar notificaciones'}
            </button>
          )}

          {isSubscribed && (
            <button
              onClick={handleDisable}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {busy ? 'Desactivando…' : 'Desactivar notificaciones en este dispositivo'}
            </button>
          )}

          {isSubscribed && (
            <button
              onClick={handleTest}
              disabled={testStatus === 'sending'}
              className="px-4 py-2 text-sm font-medium text-[#1B2E3C] border border-[#1B2E3C]/30 rounded-lg hover:bg-[#1B2E3C]/5 transition-colors disabled:opacity-60"
            >
              {testStatus === 'sending' ? 'Enviando…'
                : testStatus === 'sent' ? '✓ Enviada — revisá tu dispositivo'
                : testStatus === 'error' ? 'Error al enviar'
                : 'Enviar notificación de prueba'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
