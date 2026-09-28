'use client'

import { useState, useTransition } from 'react'
import { responderOrden } from './actions'

type Decision = 'aprobada' | 'rechazada'

interface Props {
  token: string
  initialDecision: Decision | null
  respuestaPrevia: Decision | null
  comentarioPrevio: string | null
}

function Confirmada({ decision, comentario }: { decision: Decision; comentario: string | null }) {
  const aprobo = decision === 'aprobada'
  return (
    <div className={`rounded-xl border p-4 ${aprobo ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <p className={`text-sm font-semibold ${aprobo ? 'text-emerald-800' : 'text-red-800'}`}>
        {aprobo ? 'Aprobaste esta orden.' : 'No aprobaste esta orden.'}
      </p>
      {comentario && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">“{comentario}”</p>}
      <p className="mt-2 text-xs text-gray-500">Tu asesor y la Mesa de Operaciones ya recibieron tu respuesta. Si querés cambiarla, respondé el mail o contactá a tu asesor.</p>
    </div>
  )
}

export default function AprobarForm({ token, initialDecision, respuestaPrevia, comentarioPrevio }: Props) {
  const [decision, setDecision] = useState<Decision | null>(initialDecision)
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ decision: Decision; comentario: string | null } | null>(
    respuestaPrevia ? { decision: respuestaPrevia, comentario: comentarioPrevio } : null
  )
  const [pending, startTransition] = useTransition()

  if (done) return <Confirmada decision={done.decision} comentario={done.comentario} />

  function enviar() {
    if (!decision) { setError('Elegí Apruebo o No apruebo.'); return }
    setError(null)
    startTransition(async () => {
      const res = await responderOrden(token, decision, comentario)
      if (!res.ok) { setError(res.error ?? 'No se pudo enviar. Probá de nuevo.'); return }
      // Si ya había respondido (ej. desde otro dispositivo), se muestra lo que quedó registrado.
      setDone({ decision: res.decision ?? decision, comentario: res.yaRespondida ? null : (comentario.trim() || null) })
    })
  }

  const optionCls = (d: Decision) => {
    const selected = decision === d
    if (d === 'aprobada') return selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
    return selected ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">¿Aprobás esta orden?</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setDecision('aprobada')}
          className={`rounded-xl border-2 px-4 py-3 text-[15px] font-semibold transition-colors ${optionCls('aprobada')}`}>
          Apruebo
        </button>
        <button type="button" onClick={() => setDecision('rechazada')}
          className={`rounded-xl border-2 px-4 py-3 text-[15px] font-semibold transition-colors ${optionCls('rechazada')}`}>
          No apruebo
        </button>
      </div>

      <div>
        <label htmlFor="comentario" className="mb-1 block text-sm text-gray-600">Comentario (opcional)</label>
        <textarea
          id="comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Escribí lo que quieras que sepa tu asesor…"
          className="w-full rounded-lg border border-gray-200 p-3 text-base text-gray-800 focus:border-[#2D3F52] focus:outline-none md:text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="button" onClick={enviar} disabled={pending || !decision}
        className="w-full rounded-xl bg-[#2D3F52] px-4 py-3 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40">
        {pending ? 'Enviando…' : 'Enviar respuesta'}
      </button>
    </div>
  )
}
