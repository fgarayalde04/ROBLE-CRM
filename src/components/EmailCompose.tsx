'use client'

import { useState } from 'react'

interface Props {
  defaultTo?: string
  onSent?: () => void
  onClose?: () => void
}

export default function EmailCompose({ defaultTo = '', onSent, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [to,      setTo]      = useState(defaultTo)
  const [cc,      setCc]      = useState('')
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!to.trim())      { setError('El destinatario es requerido.'); return }
    if (!subject.trim()) { setError('El asunto es requerido.'); return }
    if (!body.trim())    { setError('El mensaje no puede estar vacío.'); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      to.split(',').map((s) => s.trim()).filter(Boolean),
          cc:      cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          subject: subject.trim(),
          text:    body.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error enviando email')

      setSuccess(true)
      setTimeout(() => onSent?.(), 1200)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-700">Enviado</p>
        <p className="text-xs text-gray-400 mt-0.5">El registro quedó guardado en el CRM.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSend} className="flex flex-col h-full">
      {error && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
          {error.includes('Conectá') && (
            <a href="/settings" className="ml-1.5 underline font-medium">Configuración</a>
          )}
        </div>
      )}

      <div className="flex-1 space-y-0 divide-y divide-[#EEF0F4] border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[11px] text-gray-400 w-10 shrink-0">Para</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="destinatario@ejemplo.com"
            className="flex-1 text-sm text-gray-800 outline-none placeholder:text-gray-300 bg-transparent"
            required
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[11px] text-gray-400 w-10 shrink-0">CC</span>
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="cc@ejemplo.com"
            className="flex-1 text-sm text-gray-800 outline-none placeholder:text-gray-300 bg-transparent"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[11px] text-gray-400 w-10 shrink-0">Asunto</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto del email"
            className="flex-1 text-sm text-gray-800 outline-none placeholder:text-gray-300 bg-transparent font-medium"
            required
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribí tu mensaje acá…"
          className="w-full px-3 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-300 bg-transparent resize-none min-h-[200px]"
          required
        />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
          style={{ backgroundColor: '#2D3F52' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          {loading ? 'Enviando…' : 'Enviar'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Descartar
          </button>
        )}
      </div>
    </form>
  )
}
