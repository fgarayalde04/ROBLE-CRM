import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import ProposalEditor from '@/components/proposals/ProposalEditor'

export const dynamic = 'force-dynamic'

export default async function ProposalPage({ params }: { params: { id: string } }) {
  noStore()
  const session = await getSession()
  if (!session) return null

  const [{ data: proposal }, { data: funds }, { data: bonds }, { data: equities }] = await Promise.all([
    supabaseAdmin.from('investment_proposals').select('*').eq('id', params.id).single(),
    supabaseAdmin.from('proposal_funds').select('*').eq('proposal_id', params.id).order('position'),
    supabaseAdmin.from('proposal_bonds').select('*').eq('proposal_id', params.id).order('position'),
    supabaseAdmin.from('proposal_equities').select('*').eq('proposal_id', params.id).order('position'),
  ])

  if (!proposal) notFound()

  return (
    <ProposalEditor
      initialProposal={proposal}
      initialFunds={funds ?? []}
      initialBonds={bonds ?? []}
      initialEquities={equities ?? []}
    />
  )
}
