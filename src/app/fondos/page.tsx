import { Suspense } from 'react'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
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

async function getData() {
  noStore()
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name, logo_url')
    .order('name')

  if (!managers) return []

  // Get fund counts and latest factsheet per manager
  const { data: stats } = await supabaseAdmin
    .from('fondos')
    .select('asset_manager_id, factsheets(created_at)')

  const fundCounts: Record<string, number> = {}
  const latestDates: Record<string, string> = {}

  for (const f of stats ?? []) {
    fundCounts[f.asset_manager_id] = (fundCounts[f.asset_manager_id] ?? 0) + 1
    for (const fs of (f as any).factsheets ?? []) {
      const cur = latestDates[f.asset_manager_id]
      if (!cur || fs.created_at > cur) latestDates[f.asset_manager_id] = fs.created_at
    }
  }

  // Also check factsheets without a fondo_id (unclassified)
  const { data: unclassified } = await supabaseAdmin
    .from('factsheets')
    .select('asset_manager_id, created_at')
    .is('fondo_id', null)

  for (const fs of unclassified ?? []) {
    const cur = latestDates[fs.asset_manager_id]
    if (!cur || fs.created_at > cur) latestDates[fs.asset_manager_id] = fs.created_at
  }

  return managers.map(m => ({
    ...m,
    fund_count:      fundCounts[m.id] ?? 0,
    latest_factsheet: latestDates[m.id] ?? null,
  })) as ManagerWithStats[]
}

export default async function FondosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const managers = await getData()

  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Cargando…</div>}>
      <FondosClient managers={managers} />
    </Suspense>
  )
}
