'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Microsoft error messages ─────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, { title: string; body: string; type: 'warn' | 'error' }> = {
  pending_approval: {
    type: 'warn',
    title: 'Solicitud enviada',
    body: 'Tu cuenta está pendiente de aprobación. Recibirás acceso una vez que el administrador apruebe tu solicitud.',
  },
  suspended: {
    type: 'error',
    title: 'Cuenta suspendida',
    body: 'Tu cuenta ha sido suspendida. Contactá al administrador.',
  },
  domain_not_allowed: {
    type: 'error',
    title: 'Dominio no autorizado',
    body: 'Solo se permiten cuentas corporativas @roblecapital.net. No se aceptan cuentas personales.',
  },
  microsoft_cancelled: {
    type: 'warn',
    title: 'Inicio cancelado',
    body: 'Cancelaste el inicio de sesión con Microsoft.',
  },
  microsoft_token:
  { type: 'error', title: 'Error de autenticación', body: 'No se pudo completar el inicio de sesión con Microsoft. Intentá de nuevo.' },
  microsoft_profile:
  { type: 'error', title: 'Error de perfil', body: 'No se pudo obtener la información del perfil de Microsoft.' },
  create_failed:
  { type: 'error', title: 'Error al crear cuenta', body: 'Ocurrió un error al registrar tu cuenta. Contactá al administrador.' },
  unknown:
  { type: 'error', title: 'Error inesperado', body: 'Ocurrió un error inesperado. Intentá de nuevo.' },
}

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read error from URL (set by Microsoft OAuth callback)
  const urlError = searchParams.get('error') ?? ''
  const errorInfo = ERROR_MESSAGES[urlError] ?? null

  // Email/password form (admin fallback)
  const [showAdminForm, setShowAdminForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFormError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Error al iniciar sesión')
        setLoading(false)
        return
      }
      const from = searchParams.get('from') ?? '/'
      router.push(from)
      router.refresh()
    } catch {
      setFormError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* URL error banner (from Microsoft OAuth redirect) */}
      {errorInfo && (
        <div className={`px-4 py-3 rounded-xl border ${
          errorInfo.type === 'warn'
            ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <p className={`text-sm font-semibold mb-0.5 ${errorInfo.type === 'warn' ? 'text-amber-800' : 'text-red-800'}`}>
            {errorInfo.title}
          </p>
          <p className={`text-xs ${errorInfo.type === 'warn' ? 'text-amber-700' : 'text-red-700'}`}>
            {errorInfo.body}
          </p>
        </div>
      )}

      {/* ── Microsoft Login (primary) ── */}
      <a
        href="/api/auth/microsoft-login"
        className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-800 shadow-sm"
      >
        {/* Microsoft logo */}
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 23 23" fill="none">
          <rect x="1"  y="1"  width="10" height="10" fill="#F35325"/>
          <rect x="12" y="1"  width="10" height="10" fill="#81BC06"/>
          <rect x="1"  y="12" width="10" height="10" fill="#05A6F0"/>
          <rect x="12" y="12" width="10" height="10" fill="#FFBA08"/>
        </svg>
        Continuar con Microsoft corporativo
      </a>

      <p className="text-center text-xs text-gray-400">
        Solo cuentas <span className="font-medium text-gray-500">@roblecapital.net</span>
      </p>

      {/* ── Admin fallback ── */}
      <div className="pt-2 border-t border-gray-100">
        {!showAdminForm ? (
          <button
            type="button"
            onClick={() => setShowAdminForm(true)}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Acceso con contraseña (admin)
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 border"
              style={{ backgroundColor: '#FEFCE8', borderColor: '#E9E5C8' }}
            >
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="admin@roblecapital.net"
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
              />
            </div>

            <div
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 border"
              style={{ backgroundColor: '#FEFCE8', borderColor: '#E9E5C8' }}
            >
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            {formError && (
              <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-xs text-red-700">{formError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
                style={{ backgroundColor: '#2D3F52' }}
              >
                {loading ? 'Accediendo...' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdminForm(false); setFormError('') }}
                className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
