import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { count } = await supabaseAdmin
      .from('proposal_equities').select('*', { count: 'exact', head: true }).eq('proposal_id', params.id)

    const { data, error } = await supabaseAdmin
      .from('proposal_equities')
      .insert({
        proposal_id:  params.id,
        position:     (count ?? 0),
        ticker:       body.ticker       ?? null,
        company_name: body.company_name ?? null,
        sector:       body.sector       ?? null,
        country:      body.country      ?? null,
        currency:     body.currency     ?? 'USD',
        pct:          body.pct          ?? 0,
        amount:       body.amount       ?? 0,
      })
      .select().single()

    if (error) throw error
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
    for (const c of ['ticker','company_name','sector','country','currency','pct','amount']) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    const { data, error } = await supabaseAdmin
      .from('proposal_equities').update(allowed).eq('id', equity_id).eq('proposal_id', params.id).select().single()

    if (error) throw error
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
    const { error } = await supabaseAdmin
      .from('proposal_equities').delete().eq('id', searchParams.get('equity_id')).eq('proposal_id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
