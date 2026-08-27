import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProposalWithLines, createProposal, insertProposalLine } from '@/lib/db/proposals'

// POST /api/proposals/[id]/duplicate
// Crea una copia completa de la propuesta (mismos fondos/bonos/acciones) para
// no tener que rearmar todo de cero cuando se le quiere ofrecer la misma
// cartera a otro cliente — el cliente/título se ajustan después en el editor.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { proposal, funds, bonds, equities } = await getProposalWithLines(params.id)
    if (!proposal) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    const copy = await createProposal({
      client_id:       proposal.client_id,
      client_name:     proposal.client_name,
      client_email:    proposal.client_email,
      advisor_id:      session.id,
      advisor_name:    session.name ?? null,
      total_amount:    proposal.total_amount,
      currency:        proposal.currency,
      title:           proposal.title ? `${proposal.title} (copia)` : 'Propuesta (copia)',
      notes:           proposal.notes,
      disclaimer:      proposal.disclaimer,
      status:          'draft',
      shared_with_all: false,
      total_ventas:    proposal.total_ventas,
      settlement_date: proposal.settlement_date,
    })

    const copyLine = (table: string, row: Record<string, any>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, proposal_id, created_at, ...rest } = row
      return insertProposalLine(table, { ...rest, proposal_id: copy.id })
    }

    await Promise.all([
      ...funds.map((f: any) => copyLine('proposal_funds', f)),
      ...bonds.map((b: any) => copyLine('proposal_bonds', b)),
      ...equities.map((e: any) => copyLine('proposal_equities', e)),
    ])

    return NextResponse.json({ id: copy.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
