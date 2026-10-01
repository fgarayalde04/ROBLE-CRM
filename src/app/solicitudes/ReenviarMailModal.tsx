'use client'

import { useState } from 'react'

// Reenviar el mail de una orden ya enviada (ej. el mail del cliente estaba
// mal): misma orden, se corrigen los destinatarios y se vuelve a mandar. El
// link de Apruebo / No apruebo es el mismo de la orden, así que la respuesta
// del cliente se sigue registrando en esta orden.

interface Sol {
  id: string
  client_name: string | null
  client_number: string | null
  client_email: string | null
  additional_emails?: string[] | null
  cc_emails?: string[] | null
  mail_asunto?: string | null
  mail_cuerpo?: string | null
  mail_preview?: string | null
}

function parseList(v: string) {
  return v.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ReenviarMailModal({
  sol, onAction, onClose,
}: {
  sol: Sol
  onAction: (accion: string, extra?: Record<string, unknown>) => Promise<void>
  onClose: () => void
}) {
  const anteriores = [sol.client_email, ...(sol.additional_emails ?? [])].filter(Boolean) as string[]
  const [to, setTo] = useState(anteriores.join(', '))
  const [cc, setCc] = useState((sol.cc_emails ?? []).join(', '))
  const [asunto, setAsunto] = useState(sol.mail_asunto ?? '')
  const [cuerpo, setCuerpo] = useState(sol.mail_cuerpo ?? sol.mail_preview ?? '')
  const [guardarEnFicha, setGuardarEnFicha] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    const toList = parseList(to)
    const ccList = parseList(cc)
    const invalidos = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e))
    if (toList.length === 0) { setError('Poné al menos un destinatario.'); return }
    if (invalidos.length) { setError(`Revisá: ${invalidos.join(', ')}`); return }
    if (!asunto.trim() || !cuerpo.trim()) { setError('Falta el asunto o el cuerpo del mail.'); return }

    setSending(true); setError(null)
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList.length > 1 ? toList : toList[0],
          cc: ccList.length ? ccList : undefined,
          subject: asunto, body: cuerpo,
          client_name: sol.client_name, client_number: sol.client_number,
          solicitud_uuid: sol.id, viaMesa: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
      await onAction('mail_enviado', {
        reenvio: true,
        to: toList, cc: ccList,
        guardar_en_ficha: guardarEnFicha,
        asunto, cuerpo,
        mail_thread_id: data.thread_id ?? null,
        mail_message_id: data.message_id ?? null,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  const input = 'w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Reenviar mail · {sol.client_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Misma orden: corregí el mail y volvé a enviarla.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {anteriores.length > 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2">
              Se envió a: <span className="font-mono">{anteriores.join(', ')}</span>
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Para</label>
            <input className={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@cliente.com, otro@cliente.com" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CC</label>
            <input className={input} value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Asunto</label>
            <input className={input} value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cuerpo</label>
            <textarea rows={12} className={`${input} font-mono resize-y`} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={guardarEnFicha} onChange={(e) => setGuardarEnFicha(e.target.checked)} />
            Guardar el primer mail de &quot;Para&quot; como mail principal del cliente
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={enviar} disabled={sending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {sending ? 'Enviando…' : 'Reenviar al cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
