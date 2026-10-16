import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasPermission } from '@/lib/auth'
import { listConsolidados, type ConsolidadoRow } from '@/lib/db/consolidados'
import ListaPortafolios from './ListaPortafolios'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Portafolio' }

// Portafolio: la lista de portafolios armados y "Nuevo reporte", que abre la
// misma herramienta para una o varias cuentas de Pershing y Morgan Stanley.
export default async function FactsheetPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'factsheet', session.permissions)) redirect('/')

  // Cada uno ve los que armó y los que le compartieron (dirección incluida).
  let guardados: ConsolidadoRow[] = []
  try {
    guardados = await listConsolidados({ creadoPor: session.name, userId: session.id ?? null })
  } catch (err) {
    console.error('[portafolio] list', err)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-10 border-b border-gray-200 bg-white px-4 py-3 md:top-0 md:px-6 md:py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portafolio</h1>
            <p className="mt-0.5 text-xs text-gray-400">Portafolios armados por cliente, con una o varias cuentas de Pershing y Morgan Stanley</p>
          </div>
          <Link href="/factsheet/consolidado" className="rounded-lg bg-[#2E7D52] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#256841]">
            Nuevo reporte
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <ListaPortafolios guardados={guardados} usuario={session.name} />
      </div>
    </div>
  )
}
