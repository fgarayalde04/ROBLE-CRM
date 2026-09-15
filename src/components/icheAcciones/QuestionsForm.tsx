'use client'

import { useState } from 'react'
import type { Analyst, IcheQuestion, QuestionAnswer } from '@/lib/icheAcciones/types'

interface Props {
  questions: IcheQuestion[]
  onSubmit: (answers: Record<string, QuestionAnswer>) => void
  loading: boolean
}

export default function QuestionsForm({ questions, onSubmit, loading }: Props) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({})

  function setAnswer(id: string, patch: Partial<QuestionAnswer>) {
    setAnswers(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const allAnswered = questions.every(q => {
    const a = answers[q.id]
    if (!a) return false
    if (q.type === 'assign_analyst') return !!a.analyst
    if (q.type === 'unmatched_close') return !!a.resolution && (a.resolution === 'leave_as_is' || !!a.closeDetails)
    return false
  })

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Encontré {questions.length} cosa(s) que necesitan tu confirmación antes de generar el Excel.
      </p>

      {questions.map(q => (
        <div key={q.id} className="rounded-lg border border-gray-200 p-4">
          {q.type === 'assign_analyst' && (
            <AssignAnalystQuestion
              q={q}
              value={answers[q.id]}
              onChange={patch => setAnswer(q.id, patch)}
            />
          )}
          {q.type === 'unmatched_close' && (
            <UnmatchedCloseQuestion
              q={q}
              value={answers[q.id]}
              onChange={patch => setAnswer(q.id, patch)}
            />
          )}
        </div>
      ))}

      <button
        disabled={!allAnswered || loading}
        onClick={() => onSubmit(answers)}
        className="rounded-md bg-[#3A3A3C] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {loading ? 'Generando…' : 'Confirmar y generar Excel'}
      </button>
    </div>
  )
}

function AssignAnalystQuestion({ q, value, onChange }: {
  q: Extract<IcheQuestion, { type: 'assign_analyst' }>
  value: QuestionAnswer | undefined
  onChange: (patch: Partial<QuestionAnswer>) => void
}) {
  return (
    <div>
      <p className="font-medium text-[#2D3F52]">Posición nueva sin asignar</p>
      <p className="mt-1 text-sm text-gray-600">
        {q.description} — {q.quantity} acciones a ${q.unitCost.toFixed(4)} ({q.source === 'pershing' ? 'Pershing' : 'Morgan Stanley'})
      </p>

      {q.tickerEditable && (
        <div className="mt-2">
          <label className="text-xs text-gray-500">Ticker</label>
          <input
            defaultValue={q.suggestedTicker}
            onChange={e => onChange({ ticker: e.target.value })}
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {q.source === 'pershing' && (
            <span className="ml-2 text-xs text-amber-600">Pershing no da el ticker — confirmá cuál es (CUSIP: {q.cusip})</span>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-4">
        {(['CHINO', 'INDIO'] as Analyst[]).map(a => (
          <label key={a} className="flex items-center gap-1 text-sm">
            <input
              type="radio"
              name={`analyst-${q.id}`}
              checked={value?.analyst === a}
              onChange={() => onChange({ analyst: a })}
            />
            {a === 'CHINO' ? 'Chino' : 'Indio'}
          </label>
        ))}
      </div>
    </div>
  )
}

function UnmatchedCloseQuestion({ q, value, onChange }: {
  q: Extract<IcheQuestion, { type: 'unmatched_close' }>
  value: QuestionAnswer | undefined
  onChange: (patch: Partial<QuestionAnswer>) => void
}) {
  return (
    <div>
      <p className="font-medium text-[#2D3F52]">{q.ticker} desapareció y no encontré la venta</p>
      <p className="mt-1 text-sm text-gray-600">
        {q.description} — {q.lastKnownQuantity} acciones ({q.analyst === 'CHINO' ? 'Chino' : 'Indio'}) estaban abiertas el mes pasado y no aparecen ni en Pershing ni en Morgan, y no encontré una venta en ningún Activity.
      </p>

      <div className="mt-2 flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`resolution-${q.id}`}
            checked={value?.resolution === 'leave_as_is'}
            onChange={() => onChange({ resolution: 'leave_as_is' })}
          />
          No se vendió, dejarla como abierta
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`resolution-${q.id}`}
            checked={value?.resolution === 'closed_with_details'}
            onChange={() => onChange({ resolution: 'closed_with_details' })}
          />
          Se vendió, cargar los datos:
        </label>
        {value?.resolution === 'closed_with_details' && (
          <div className="ml-6 flex gap-2">
            <input
              type="date"
              placeholder="Fecha de venta"
              onChange={e => onChange({ closeDetails: { ...value.closeDetails, closingDate: e.target.value, quantity: value.closeDetails?.quantity ?? q.lastKnownQuantity, proceeds: value.closeDetails?.proceeds ?? 0 } })}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="number"
              placeholder="Cantidad"
              defaultValue={q.lastKnownQuantity}
              onChange={e => onChange({ closeDetails: { ...value.closeDetails!, quantity: parseFloat(e.target.value), closingDate: value.closeDetails?.closingDate ?? '', proceeds: value.closeDetails?.proceeds ?? 0 } })}
              className="w-28 rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="number"
              placeholder="Importe recibido ($)"
              onChange={e => onChange({ closeDetails: { ...value.closeDetails!, proceeds: parseFloat(e.target.value), closingDate: value.closeDetails?.closingDate ?? '', quantity: value.closeDetails?.quantity ?? q.lastKnownQuantity } })}
              className="w-40 rounded border border-gray-300 px-2 py-1"
            />
          </div>
        )}
      </div>
    </div>
  )
}
