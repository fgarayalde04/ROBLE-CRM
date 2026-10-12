import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getPlanilla } from '@/lib/planillas/settings'
import { canSeeMenuKey } from '@/lib/auth/menu'
import { getLatestGeneration, listGenerations } from '@/lib/icheAcciones/db'
import HistoryList from '@/components/icheAcciones/HistoryList'
import AccionesWizard from '@/components/icheAcciones/AccionesWizard'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getPlanilla('iche')).title }
}
export const dynamic = 'force-dynamic'

export default async function IcheAccionesPage() {
  noStore()
  const info = await getPlanilla('iche')

  const session = await getSession()
  if (!session || !canSeeMenuKey(session.role, 'menu_planillas', session.permissions)) redirect('/')

  const [latest, history] = await Promise.all([getLatestGeneration(), listGenerations()])

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">{info.title}</h1>
        <p className="mt-0.5 text-sm text-gray-400">{info.description}</p>
      </div>
      <AccionesWizard
        initialResult={latest}
        apiBase="/api/admin/planillas/iche-acciones"
        fileCount={4}
        dropzoneHint="Soltá acá los 4 archivos del mes (Unrealized Pershing, Activity Pershing, Holdings Morgan, Activity Morgan) — el sistema detecta cuál es cuál. Podés subirlos de a uno, cada archivo nuevo se suma a los anteriores."
      />
      <HistoryList rows={history} apiBase="/api/admin/planillas/iche-acciones" />
    </div>
  )
}
