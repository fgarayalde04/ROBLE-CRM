import { NextResponse } from 'next/server'
import { listProposals, createProposal } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const isPrivileged = session.role === 'admin' || session.role === 'ceo'
    const data = await listProposals(status, isPrivileged ? null : { advisorId: session.id })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()

    const data = await createProposal({
      client_id:    body.client_id    ?? null,
      client_name:  body.client_name  ?? null,
      client_email: body.client_email ?? null,
      advisor_id:   session.id,
      advisor_name: session.name ?? null,
      total_amount: body.total_amount ?? 0,
      currency:     body.currency     ?? 'USD',
      title:        body.title        ?? null,
      disclaimer:   body.disclaimer   ?? null,
      status:       'draft',
    })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
