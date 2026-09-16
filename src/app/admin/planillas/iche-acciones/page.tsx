import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getLatestGeneration } from '@/lib/icheAcciones/db'
import IcheAccionesWizard from './IcheAccionesWizard'

export const metadata: Metadata = { title: 'Iche Acciones' }
export const dynamic = 'force-dynamic'

export default async function IcheAccionesPage() {
  noStore()

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/')

  const latest = await getLatestGeneration()

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Iche Acciones</h1>
        <p className="mt-0.5 text-sm text-gray-400">Actualización mensual de la planilla de acciones — cliente Isaac Shcolnik</p>
      </div>
      <IcheAccionesWizard initialResult={latest} />
    </div>
  )
}
