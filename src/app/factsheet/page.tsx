import { Suspense } from 'react'
import FactsheetClient from './FactsheetClient'

export const metadata = { title: 'Portfolio Factsheet — Roble Capital' }

export default function FactsheetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Cargando…</div>}>
      <FactsheetClient />
    </Suspense>
  )
}
