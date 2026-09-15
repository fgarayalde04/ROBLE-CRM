import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Planillas' }
export const dynamic = 'force-dynamic'

// Índice de herramientas especiales de un solo cliente/caso puntual — no un
// CRUD genérico por cliente. No está en el Sidebar, se accede por URL directa.
export default async function PlanillasPage() {
  noStore()

  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/')

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Planillas</h1>
        <p className="mt-0.5 text-sm text-gray-400">Herramientas especiales de planillas para casos puntuales</p>
      </div>

      <Link
        href="/admin/planillas/iche-acciones"
        className="block max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <h2 className="font-medium text-[#2D3F52]">Iche Acciones</h2>
        <p className="mt-1 text-sm text-gray-500">Actualización mensual — cliente Isaac Shcolnik</p>
      </Link>
    </div>
  )
}
