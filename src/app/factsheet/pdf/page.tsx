import { Suspense } from 'react'
import FactsheetClient from '../FactsheetClient'

export const metadata = { title: 'Generar PDF — Portfolio Factsheet' }

// Generador de PDF institucional clásico — sigue exactamente igual que
// antes, solo se movió de /factsheet a /factsheet/pdf cuando /factsheet
// pasó a ser el nuevo dashboard interactivo de Portafolio.
export default function FactsheetPdfPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Cargando…</div>}>
      <FactsheetClient />
    </Suspense>
  )
}
