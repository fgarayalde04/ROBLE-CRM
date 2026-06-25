'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { AuthorizedEmail, EmailSuggestion } from '@/app/api/authorized-emails/route'

interface Props {
  clientNumber: string
  clientName: string
  userName: string
  value: string
  onChange: (email: string) => void
}

const inputCls =
  'w-full text-sm px-3 py-2 pr-8 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'

export default function AuthorizedEmailPicker({
  clientNumber, clientName, userName, value, onChange,
}: Props) {
  const [authorized, setAuthorized]   = useState<AuthorizedEmail[]>([])
  const [suggestions, setSuggestions] = useState<EmailSuggestion[]>([])
  const [loading, setLoading]         = useState(false)

  // The best candidate loaded when client was selected
  const [suggestion, setSuggestion]   = useState<string | null>(null)
  // Whether user explicitly discarded the suggestion
  const [discarded, setDiscarded]     = useState(false)

  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Fetch emails when client changes ────────────────────────────────────────

  const fetchEmails = useCallback(async () => {
    if (!clientNumber && !clientName) {
      setAuthorized([]); setSuggestions([]); setSuggestion(null); setDiscarded(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientNumber) params.set('client_number', clientNumber)
      if (clientName)   params.set('client_name',   clientName)
      const res  = await fetch(`/api/authorized-emails?${params}`)
      const data = await res.json()

      const auth: AuthorizedEmail[] = data.authorized  ?? []
      const sugg: EmailSuggestion[] = data.suggestions ?? []

      setAuthorized(auth)
      setSuggestions(sugg)

      // Pick best candidate: first authorized (most used), then first suggestion
      const best = auth[0]?.email ?? sugg[0]?.email ?? null
      setSuggestion(best)
      setDiscarded(false)

      // Auto-fill only if field is currently empty
      if (best && !value) onChange(best)
    } catch {
      setAuthorized([]); setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [clientNumber, clientName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchEmails() }, [fetchEmails])

  // Reset when client clears
  useEffect(() => {
    if (!clientNumber && !clientName) {
      onChange(''); setSuggestion(null); setDiscarded(false)
    }
  }, [clientNumber, clientName]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Authorize a suggestion ────────────────────────────────────────────────

  async function authorizeEmail(email: string) {
    setAuthorizing(email)
    try {
      await fetch('/api/authorized-emails', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ numero_cliente: clientNumber, nombre_cliente: clientName, email }),
      })
      await fetchEmails()
      onChange(email)
    } finally {
      setAuthorizing(null) }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const isAuthorized = authorized.some(
    (a) => a.email.toLowerCase() === value.toLowerCase()
  )
  const isSuggested = !isAuthorized && suggestion !== null &&
    value.toLowerCase() === suggestion.toLowerCase()

  // All available options except the current value
  const allEmails = [
    ...authorized.map((a) => ({ email: a.email, type: 'authorized' as const })),
    ...suggestions.map((s) => ({ email: s.email, type: 'suggestion' as const })),
  ].filter((o) => o.email.toLowerCase() !== value.toLowerCase())

  // ── No client: plain input ────────────────────────────────────────────────

  if (!clientNumber && !clientName) {
    return (
      <input
        className={inputCls}
        placeholder="destinatario@ejemplo.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <div className="space-y-1.5">

      {/* ── Input — always editable ── */}
      <div className="relative">
        {loading ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
        ) : (
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        )}
        <input
          ref={inputRef}
          className={`${inputCls} pl-8`}
          placeholder={loading ? 'Buscando emails…' : 'destinatario@ejemplo.com'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); inputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-300 hover:text-gray-500 transition"
            title="Limpiar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Status row under input ── */}
      {value && (
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          {/* Badge */}
          {isAuthorized ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Email autorizado
            </span>
          ) : isSuggested ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              Email sugerido
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              Email sin autorizar
            </span>
          )}

          {/* Descartar sugerencia */}
          {isSuggested && !discarded && (
            <button
              type="button"
              onClick={() => {
                setDiscarded(true)
                onChange('')
                setTimeout(() => inputRef.current?.focus(), 0)
              }}
              className="text-[10px] text-gray-400 hover:text-red-500 transition underline"
            >
              Descartar sugerencia
            </button>
          )}

          {/* Autorizar si no está autorizado */}
          {value && !isAuthorized && clientNumber && (
            <button
              type="button"
              onClick={() => authorizeEmail(value.trim().toLowerCase())}
              disabled={authorizing === value}
              className="text-[10px] text-emerald-600 hover:text-emerald-700 transition underline disabled:opacity-50"
            >
              {authorizing === value ? 'Autorizando…' : '+ Autorizar este email'}
            </button>
          )}
        </div>
      )}

      {/* ── Restaurar sugerencia ── */}
      {discarded && suggestion && (
        <button
          type="button"
          onClick={() => {
            setDiscarded(false)
            onChange(suggestion)
          }}
          className="flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-700 transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          Restaurar sugerencia ({suggestion})
        </button>
      )}

      {/* ── Emails disponibles ── */}
      {allEmails.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 px-0.5">
            {value ? 'Otros emails disponibles:' : 'Emails disponibles:'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allEmails.map((opt) => (
              <button
                key={opt.email}
                type="button"
                onClick={() => onChange(opt.email)}
                className={[
                  'flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition',
                  opt.type === 'authorized'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
                ].join(' ')}
                title={opt.type === 'authorized' ? 'Email autorizado' : 'Sugerencia del historial'}
              >
                {opt.type === 'authorized' && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
                {opt.email}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Sin emails registrados ── */}
      {!loading && authorized.length === 0 && suggestions.length === 0 && !value && (
        <p className="text-[11px] text-amber-600 px-0.5">
          No hay emails autorizados ni historial para este cliente. Ingresá el email manualmente.
        </p>
      )}

    </div>
  )
}
