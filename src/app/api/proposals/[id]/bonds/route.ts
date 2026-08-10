import { NextResponse } from 'next/server'
import { nextPosition, insertProposalLine, updateProposalLine, deleteProposalLine } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

const TABLE = 'proposal_bonds'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const position = await nextPosition(TABLE, params.id)

    const data = await insertProposalLine(TABLE, {
      proposal_id:   params.id,
      position,
      isin:          body.isin          ?? null,
      issuer:        body.issuer        ?? null,
      bond_type:     body.bond_type     ?? null,
      price:         body.price         ?? null,
      currency:      body.currency      ?? 'USD',
      maturity_date: body.maturity_date ?? null,
      coupon:        body.coupon        ?? null,
      yield:         body.yield         ?? null,
      duration:      body.duration      ?? null,
      rating:        body.rating        ?? null,
      pct:           body.pct           ?? 0,
      amount:        body.amount        ?? 0,
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

    const { bond_id, ...fields } = await req.json()
    const allowed: Record<string, unknown> = {}
    for (const c of ['isin','issuer','bond_type','price','currency','maturity_date','coupon','yield','duration','rating','pct','amount']) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    const data = await updateProposalLine(TABLE, bond_id, params.id, allowed)
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
    await deleteProposalLine(TABLE, searchParams.get('bond_id'), params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
