import { NextResponse } from 'next/server'
import { nextPosition, insertProposalLine, updateProposalLine, deleteProposalLine } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

const TABLE = 'proposal_equities'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const position = await nextPosition(TABLE, params.id)

    const data = await insertProposalLine(TABLE, {
      proposal_id:  params.id,
      position,
      ticker:       body.ticker       ?? null,
      company_name: body.company_name ?? null,
      sector:       body.sector       ?? null,
      country:      body.country      ?? null,
      currency:     body.currency     ?? 'USD',
      pct:          body.pct          ?? 0,
      amount:       body.amount       ?? 0,
      operacion:    body.operacion    ?? 'compra',
      broker:       body.broker       ?? null,
    })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { equity_id, ...fields } = await req.json()
    const allowed: Record<string, unknown> = {}
    for (const c of ['ticker','company_name','sector','country','currency','pct','amount','operacion','broker']) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    const data = await updateProposalLine(TABLE, equity_id, params.id, allowed)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    await deleteProposalLine(TABLE, searchParams.get('equity_id'), params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
