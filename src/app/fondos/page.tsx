import { Suspense } from 'react'
import { unstable_noStore as noStore } from 'next/cache'
import { getManagersWithStats } from '@/lib/db/fondos'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FondosClient from './FondosClient'

export const metadata = { title: 'Fondos — Biblioteca de Factsheets' }
export const dynamic = 'force-dynamic'

export type ManagerWithStats = {
  id: string
  slug: string
  name: string
  logo_url: string | null
  fund_count: number
  latest_factsheet: string | null
}

export default async function FondosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  noStore()
  const managers = await getManagersWithStats() as ManagerWithStats[]

  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Cargando…</div>}>
      <FondosClient managers={managers} />
    </Suspense>
  )
}
