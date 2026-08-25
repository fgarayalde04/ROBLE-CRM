import { NextResponse } from 'next/server'
import { getProposalWithLines, updateProposal, deleteProposal } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { proposal, funds, bonds, equities } = await getProposalWithLines(params.id)
    return NextResponse.json({ proposal, funds, bonds, equities })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const allowed: Record<string, unknown> = {}
    const fields = ['title', 'client_id', 'client_name', 'client_email', 'total_amount', 'total_ventas', 'currency', 'status', 'notes', 'disclaimer', 'sent_at', 'shared_with_all', 'settlement_date']
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f]
    }

    const data = await updateProposal(params.id, allowed)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    await deleteProposal(params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
