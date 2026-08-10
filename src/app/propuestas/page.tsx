import { unstable_noStore as noStore } from 'next/cache'
import { listProposals, getProposalAllocationsForIds } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'
import ProposalListClient from '@/components/proposals/ProposalListClient'

export const dynamic = 'force-dynamic'

export default async function ProposalsPage() {
  noStore()
  const session = await getSession()
  if (!session) return null

  const isPrivileged = session.role === 'admin' || session.role === 'ceo'
  const proposals = await listProposals(null, isPrivileged ? null : { advisorId: session.id })
  const ids = proposals.map(p => p.id)

  const { funds, bonds, equities } = await getProposalAllocationsForIds(ids)

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
