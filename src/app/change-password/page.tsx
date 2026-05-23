'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (next !== confirm) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    if (next.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al cambiar la contraseña')
        return
      }
      setDone(true)
      setTimeout(() => router.push('/inbox'), 2000)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/download.png" alt="Roble Capital" width={140} height={38} className="object-contain" priority />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-7 py-8 space-y-6">

          {done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">¡Contraseña actualizada!</p>
              <p className="text-xs text-gray-400">Redirigiendo al panel…</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h1 className="text-base font-bold text-gray-900">Cambiá tu contraseña</h1>
                </div>
                <p className="text-xs text-gray-400 pl-10">
                  Ingresaste con una contraseña temporal. Creá una contraseña personal para continuar.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Current password */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Contraseña temporal</label>
                  <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 border border-gray-200 bg-gray-50">
                    <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={current}
                      onChange={e => setCurrent(e.target.value)}
                      required
                      autoFocus
                      placeholder="Tu contraseña actual"
                      className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
                    />
                    <button type="button" onClick={() => setShowCurrent(v => !v)} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        {showCurrent
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                        }
                      </svg>
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Nueva contraseña</label>
                  <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 border border-gray-200" style={{ backgroundColor: '#FEFCE8', borderColor: '#E9E5C8' }}>
                    <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <input
                      type={showNext ? 'text' : 'password'}
                      value={next}
                      onChange={e => setNext(e.target.value)}
                      required
                      placeholder="Mínimo 8 caracteres"
                      className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
                    />
                    <button type="button" onClick={() => setShowNext(v => !v)} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        {showNext
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                        }
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Confirm */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirmá la nueva contraseña</label>
                  <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 border border-gray-200" style={{ backgroundColor: '#FEFCE8', borderColor: '#E9E5C8' }}>
                    <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      placeholder="Repetí la contraseña"
                      className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
                    />
                    {confirm && (
                      <span className={`text-xs font-medium ${next === confirm ? 'text-green-500' : 'text-red-400'}`}>
                        {next === confirm ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !current || !next || !confirm}
                  className="w-full py-3 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#2D3F52' }}
                >
                  {loading ? 'Guardando…' : 'Establecer nueva contraseña'}
                </button>
              </form>

              <p className="text-center text-xs text-gray-400">
                ¿Querés hacerlo después?{' '}
                <button onClick={() => router.push('/inbox')} className="text-gray-600 font-medium hover:underline">
                  Ir al panel
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
