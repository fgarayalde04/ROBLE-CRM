import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import ProposalListClient from '@/components/proposals/ProposalListClient'

export const dynamic = 'force-dynamic'

export default async function ProposalsPage() {
  noStore()
  const session = await getSession()
  if (!session) return null

  let query = supabaseAdmin
    .from('investment_proposals')
    .select('*')
    .order('created_at', { ascending: false })

  if (session.role !== 'admin' && session.role !== 'ceo') {
    query = query.or(`advisor_id.eq.${session.id},shared_with_all.eq.true`)
  }

  const { data: proposals } = await query
  const ids = (proposals ?? []).map(p => p.id)

  // Fetch allocation data for all proposals in parallel
  const [{ data: funds }, { data: bonds }, { data: equities }] = await Promise.all([
    ids.length > 0
      ? supabaseAdmin.from('proposal_funds').select('proposal_id, pct, ytm_indicative').in('proposal_id', ids)
      : { data: [] },
    ids.length > 0
      ? supabaseAdmin.from('proposal_bonds').select('proposal_id, pct, yield').in('proposal_id', ids)
      : { data: [] },
    ids.length > 0
      ? supabaseAdmin.from('proposal_equities').select('proposal_id, pct').in('proposal_id', ids)
      : { data: [] },
  ])

  // Compute per-proposal stats
  const stats: Record<string, { funds_pct: number; bonds_pct: number; equities_pct: number; avg_yield: number | null }> = {}

  for (const id of ids) {
    const pFunds    = (funds     ?? []).filter(f => f.proposal_id === id)
    const pBonds    = (bonds     ?? []).filter(b => b.proposal_id === id)
    const pEquities = (equities  ?? []).filter(e => e.proposal_id === id)

    const funds_pct    = pFunds.reduce((s, f) => s + (f.pct ?? 0), 0)
    const bonds_pct    = pBonds.reduce((s, b) => s + (b.pct ?? 0), 0)
    const equities_pct = pEquities.reduce((s, e) => s + (e.pct ?? 0), 0)

    // Weighted average yield (funds YTM + bonds yield), weighted by pct
    const yieldItems = [
      ...pFunds.filter(f => f.ytm_indicative != null && f.pct > 0).map(f => ({ pct: f.pct, y: f.ytm_indicative as number })),
      ...pBonds.filter(b => b.yield          != null && b.pct > 0).map(b => ({ pct: b.pct, y: b.yield          as number })),
    ]
    const yPctSum  = yieldItems.reduce((s, i) => s + i.pct, 0)
    const avg_yield = yPctSum > 0
      ? yieldItems.reduce((s, i) => s + i.y * i.pct, 0) / yPctSum
      : null

    stats[id] = { funds_pct, bonds_pct, equities_pct, avg_yield }
  }

  return (
    <div className="p-8" style={{ backgroundColor: '#F4F6F8', minHeight: '100vh' }}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#2D3F52' }}>Propuestas de Inversión</h1>
          <p className="mt-1 text-sm text-gray-500">Creá, editá y generá propuestas profesionales para tus clientes</p>
        </div>
      </div>
      <ProposalListClient
        initialProposals={proposals ?? []}
        initialStats={stats}
        currentUserId={session.id}
      />
    </div>
  )
}
