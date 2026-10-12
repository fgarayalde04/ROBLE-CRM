import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { canSeeMenuKey } from '@/lib/auth/menu'
import { getPlanillas } from '@/lib/planillas/settings'
import PlanillaCard from './PlanillaCard'

export const metadata: Metadata = { title: 'Planillas' }
export const dynamic = 'force-dynamic'

// Índice de herramientas especiales de un solo cliente/caso puntual — no un
// CRUD genérico por cliente. El nombre de cada planilla se edita acá (lápiz).
export default async function PlanillasPage() {
  noStore()

  const session = await getSession()
  if (!session || !canSeeMenuKey(session.role, 'menu_planillas', session.permissions)) redirect('/')

  const planillas = await getPlanillas()

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Planillas</h1>
        <p className="mt-0.5 text-sm text-gray-400">Herramientas especiales de planillas para casos puntuales</p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {planillas.map(p => <PlanillaCard key={p.book} planilla={p} />)}
      </div>
    </div>
  )
}
