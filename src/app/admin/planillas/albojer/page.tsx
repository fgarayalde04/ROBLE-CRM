import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getPlanilla } from '@/lib/planillas/settings'
import { canSeeMenuKey } from '@/lib/auth/menu'
import { positionsStore } from '@/lib/icheAcciones/db'
import AccionesWizard from '@/components/icheAcciones/AccionesWizard'
import HistoryList from '@/components/icheAcciones/HistoryList'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getPlanilla('albojer')).title }
}
export const dynamic = 'force-dynamic'

export default async function AlbojerPage() {
  noStore()
  const info = await getPlanilla('albojer')

  const session = await getSession()
  if (!session || !canSeeMenuKey(session.role, 'menu_planillas', session.permissions)) redirect('/')

  const store = positionsStore('albojer')
  const [latest, history] = await Promise.all([store.getLatestGeneration(), store.listGenerations()])

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">{info.title}</h1>
        <p className="mt-0.5 text-sm text-gray-400">{info.description}</p>
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
