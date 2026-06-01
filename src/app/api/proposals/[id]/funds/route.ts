import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()

    // Get next position
    const { count } = await supabaseAdmin
      .from('proposal_funds')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', params.id)

    const { data, error } = await supabaseAdmin
      .from('proposal_funds')
      .insert({
        proposal_id:      params.id,
        position:         (count ?? 0),
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
      .select()
      .single()

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

    const body = await req.json()
    const { fund_id, ...fields } = body

    const allowed: Record<string, unknown> = {}
    const cols = ['isin','issuer','fund_name','fund_class','return_1y','return_3y','return_5y','ytm_indicative','duration_years','pct','amount','needs_review','data_source']
    for (const c of cols) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    const { data, error } = await supabaseAdmin
      .from('proposal_funds')
      .update(allowed)
      .eq('id', fund_id)
      .eq('proposal_id', params.id)
      .select()
      .single()

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
    const fundId = searchParams.get('fund_id')

    const { error } = await supabaseAdmin
      .from('proposal_funds')
      .delete()
      .eq('id', fundId)
      .eq('proposal_id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
