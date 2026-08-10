import { NextResponse } from 'next/server'
import { nextPosition, insertProposalLine, updateProposalLine, deleteProposalLine } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

const TABLE = 'proposal_funds'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const position = await nextPosition(TABLE, params.id)

    const data = await insertProposalLine(TABLE, {
      proposal_id:      params.id,
      position,
      isin:             body.isin             ?? null,
      issuer:           body.issuer           ?? null,
      fund_name:        body.fund_name        ?? null,
      fund_class:       body.fund_class       ?? null,
      return_1y:        body.return_1y        ?? null,
      return_3y:        body.return_3y        ?? null,
      return_5y:        body.return_5y        ?? null,
      ytm_indicative:   body.ytm_indicative   ?? null,
      duration_years:   body.duration_years   ?? null,
      pct:              body.pct              ?? 0,
      amount:           body.amount           ?? 0,
      data_source:      body.data_source      ?? 'manual',
      needs_review:     body.needs_review     ?? false,
      extraction_notes: body.extraction_notes ?? null,
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

    const body = await req.json()
    const { fund_id, ...fields } = body

    const allowed: Record<string, unknown> = {}
    const cols = ['isin','issuer','fund_name','fund_class','return_1y','return_3y','return_5y','ytm_indicative','duration_years','pct','amount','needs_review','data_source']
    for (const c of cols) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    const data = await updateProposalLine(TABLE, fund_id, params.id, allowed)
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
    await deleteProposalLine(TABLE, searchParams.get('fund_id'), params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
