'use client'

import { useState } from 'react'
import Dropzone4Files from '@/components/icheAcciones/Dropzone4Files'
import QuestionsForm from '@/components/icheAcciones/QuestionsForm'
import PreviewTables from '@/components/icheAcciones/PreviewTables'
import type { GenerateResponse, QuestionAnswer, ReconcilePlan } from '@/lib/icheAcciones/types'

type Step = 'upload' | 'questions' | 'preview'

export default function IcheAccionesWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [plan, setPlan] = useState<ReconcilePlan | null>(null)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(files: File[]) {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      files.forEach(f => form.append('files', f))
      const res = await fetch('/api/admin/planillas/iche-acciones/reconcile', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')

      setPlan(data.plan)
      if (data.needsInput) {
        setStep('questions')
      } else {
        await handleGenerate(data.plan, {})
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(planToUse: ReconcilePlan, answers: Record<string, QuestionAnswer>) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/planillas/iche-acciones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planToUse, answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setResult(data)
      setStep('preview')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {step === 'upload' && <Dropzone4Files onSubmit={handleUpload} loading={loading} />}

      {step === 'questions' && plan && (
        <QuestionsForm
          questions={plan.pendingQuestions}
          loading={loading}
          onSubmit={answers => handleGenerate(plan, answers)}
        />
      )}

      {step === 'preview' && result && <PreviewTables {...result} />}
    </div>
  )
}
