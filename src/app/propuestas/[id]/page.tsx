import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { getProposalWithLines, accesoPropuesta } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'
import ProposalEditor from '@/components/proposals/ProposalEditor'

export const dynamic = 'force-dynamic'

export default async function ProposalPage({ params }: { params: { id: string } }) {
  noStore()
  const session = await getSession()
  if (!session) return null
  if (!(await accesoPropuesta(params.id, session.id))) notFound()

  const { proposal, funds, bonds, equities } = await getProposalWithLines(params.id)

  if (!proposal) notFound()

  return (
    <ProposalEditor
      initialProposal={proposal}
      initialFunds={funds}
      initialBonds={bonds}
      initialEquities={equities}
    />
  )
}
