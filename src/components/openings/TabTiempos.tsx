'use client'

import { differenceInDays, parseISO } from 'date-fns'
import type { AccountOpening } from '@/types/platform'

interface Props {
  opening: AccountOpening
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysBetween(from: string | null, to: string | null | 'today'): number | null {
  if (!from) return null
  const toDate = to === 'today' ? new Date() : to ? parseISO(to) : null
  if (!toDate) return null
  return differenceInDays(toDate, parseISO(from))
}

function pace(totalDays: number): { label: string; color: string } {
  if (totalDays <= 30) return { label: 'En buen ritmo', color: 'text-emerald-700' }
  if (totalDays <= 60) return { label: 'Demorado', color: 'text-amber-700' }
  return { label: 'Muy demorado', color: 'text-red-700' }
}

interface Milestone {
  label: string
  date: string | null
  reached: boolean
}

export default function TabTiempos({ opening }: Props) {
  const today = new Date()
  const startDate = opening.start_date

  const daysTotal = differenceInDays(today, parseISO(startDate))

  const daysToDocComplete = daysBetween(startDate, opening.documentation_completed_at)
  const daysDocToBank = daysBetween(opening.documentation_completed_at, opening.sent_to_bank_at)
  const daysBankToOpen = daysBetween(opening.sent_to_bank_at, opening.account_opened_at)
  const daysToOpen = opening.account_opened_at
    ? daysBetween(startDate, opening.account_opened_at)
    : null

  const paceInfo = pace(daysToOpen ?? daysTotal)

  const milestones: Milestone[] = [
    { label: 'Carpeta creada', date: startDate, reached: true },
    { label: 'Documentacion completa', date: opening.documentation_completed_at, reached: !!opening.documentation_completed_at },
    { label: 'Enviado al banco', date: opening.sent_to_bank_at, reached: !!opening.sent_to_bank_at },
    { label: 'Cuenta abierta', date: opening.account_opened_at, reached: !!opening.account_opened_at },
  ]

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs text-gray-400">Dias totales</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{daysToOpen ?? daysTotal}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {opening.account_opened_at ? 'inicio a cuenta abierta' : 'inicio a hoy'}
          </p>
        </div>
        <div className={`rounded-lg border p-4 ${opening.account_opened_at ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#E2E8F0]'}`}>
          <p className="text-xs text-gray-400">Ritmo</p>
          <p className={`text-lg font-bold mt-1 ${paceInfo.color}`}>{paceInfo.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {daysToOpen !== null ? 'proceso completado' : 'estimado actual'}
          </p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Desglose de tiempos</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <div>
              <p className="text-sm text-gray-700">Inicio a documentacion completa</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {startDate ? formatDate(startDate) : '—'} → {formatDate(opening.documentation_completed_at)}
              </p>
            </div>
            <p className="text-lg font-bold text-gray-900 shrink-0 ml-4">
              {daysToDocComplete !== null ? `${daysToDocComplete}d` : '—'}
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <div>
              <p className="text-sm text-gray-700">Documentacion completa a envio al banco</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(opening.documentation_completed_at)} → {formatDate(opening.sent_to_bank_at)}
              </p>
            </div>
            <p className="text-lg font-bold text-gray-900 shrink-0 ml-4">
              {daysDocToBank !== null ? `${daysDocToBank}d` : '—'}
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <div>
              <p className="text-sm text-gray-700">Envio al banco a cuenta abierta</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(opening.sent_to_bank_at)} → {formatDate(opening.account_opened_at)}
              </p>
            </div>
            <p className="text-lg font-bold text-gray-900 shrink-0 ml-4">
              {daysBankToOpen !== null ? `${daysBankToOpen}d` : '—'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Total</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(startDate)} → {opening.account_opened_at ? formatDate(opening.account_opened_at) : 'hoy'}
              </p>
            </div>
            <p className="text-xl font-bold text-gray-900 shrink-0 ml-4">
              {daysToOpen !== null ? `${daysToOpen}d` : `${daysTotal}d`}
            </p>
          </div>
        </div>
      </div>

      {/* Visual timeline */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5">Cronologia</h2>
        <div className="relative">
          {milestones.map((m, idx) => (
            <div key={m.label} className="flex items-start gap-4 relative">
              {/* Connector line */}
              {idx < milestones.length - 1 && (
                <div className={`absolute left-[9px] top-5 w-0.5 h-10 ${m.reached ? 'bg-[#16A34A]' : 'bg-gray-200'}`} />
              )}
              {/* Dot */}
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center z-10 ${
                m.reached ? 'bg-[#16A34A] border-[#16A34A]' : 'bg-white border-gray-200'
              }`}>
                {m.reached && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              {/* Content */}
              <div className="pb-8">
                <p className={`text-sm font-medium ${m.reached ? 'text-gray-900' : 'text-gray-400'}`}>
                  {m.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {m.date ? formatDate(m.date) : 'Pendiente'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
