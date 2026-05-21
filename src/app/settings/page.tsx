import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasGoogleConnection, getGoogleEmail, getGoogleName } from '@/lib/google/tokens'
import SettingsClient from './SettingsClient'

export const metadata: Metadata = { title: 'Configuración | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { google_connected?: string; google_error?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const [isGoogleConnected, googleEmail, googleName] = await Promise.all([
    hasGoogleConnection(),
    getGoogleEmail(),
    getGoogleName(),
  ])

  const googleStatus = searchParams.google_connected
    ? 'connected'
    : searchParams.google_error === 'cancelled'
    ? 'cancelled'
    : searchParams.google_error
    ? 'error'
    : null

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Configuración</h1>
        <p className="mt-0.5 text-sm text-gray-400">Perfil y conexiones externas</p>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Profile card */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Perfil
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-white">
                {session.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{session.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{session.email ?? '—'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{session.role}</p>
            </div>
          </div>
        </div>

        {/* Google connection card */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <GoogleIcon />
            <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Google Workspace
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Conectá tu cuenta Google para acceder a Gmail y Google Calendar desde el CRM.
          </p>

          {/* Status banners */}
          {googleStatus === 'connected' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              ✓ Google conectado correctamente.
            </div>
          )}
          {googleStatus === 'cancelled' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              Cancelaste la conexión con Google.
            </div>
          )}
          {googleStatus === 'error' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              Hubo un error al conectar con Google. Intentá de nuevo.
            </div>
          )}

          {isGoogleConnected ? (
            <div className="space-y-3">
              {/* Connected state */}
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {googleName ?? googleEmail ?? 'Conectado'}
                  </p>
                  {googleEmail && googleName && (
                    <p className="text-xs text-gray-500">{googleEmail}</p>
                  )}
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                  Activo
                </span>
              </div>

              {/* Permission badges */}
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Google Calendar
                </span>
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Gmail (envío)
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <a
                  href="/api/auth/google-connect"
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Reconectar / cambiar cuenta
                </a>
                <SettingsClient />
              </div>
            </div>
          ) : (
            /* Not connected */
            <a
              href="/api/auth/google-connect"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors shadow-sm"
            >
              <GoogleIcon />
              Conectar cuenta Google
            </a>
          )}
        </div>

        {/* Microsoft (SharePoint only) info card */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <MsIcon />
            <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Microsoft / SharePoint
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Usás Microsoft para iniciar sesión y acceder a documentos en SharePoint y OneDrive.
            El acceso es compartido por la organización.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <span className="text-xs text-gray-600">Activo · autenticación corporativa</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function MsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" fill="none" aria-hidden>
      <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
      <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
      <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
