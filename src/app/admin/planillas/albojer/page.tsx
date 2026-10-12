import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { positionsStore } from '@/lib/icheAcciones/db'
import AccionesWizard from '@/components/icheAcciones/AccionesWizard'
import HistoryList from '@/components/icheAcciones/HistoryList'

export const metadata: Metadata = { title: 'Análisis Albojer' }
export const dynamic = 'force-dynamic'

export default async function AlbojerPage() {
  noStore()

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/')

  const store = positionsStore('albojer')
  const [latest, history] = await Promise.all([store.getLatestGeneration(), store.listGenerations()])

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Análisis Albojer</h1>
        <p className="mt-0.5 text-sm text-gray-400">Actualización mensual de la planilla de acciones — De Bellis, Pershing ROJ900554</p>
      </div>
      <AccionesWizard
        initialResult={latest}
        apiBase="/api/admin/planillas/albojer"
        fileCount={2}
        dropzoneHint="Soltá acá los 2 archivos de Pershing (Unrealized Gain/Loss y Activity) — el sistema detecta cuál es cuál. Podés subirlos de a uno."
      />
      <HistoryList rows={history} apiBase="/api/admin/planillas/albojer" />
    </div>
  )
}
