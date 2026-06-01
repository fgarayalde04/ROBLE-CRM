import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const [{ data: proposal, error: pErr }, { data: funds }, { data: bonds }, { data: equities }] =
      await Promise.all([
        supabaseAdmin.from('investment_proposals').select('*').eq('id', params.id).single(),
        supabaseAdmin.from('proposal_funds').select('*').eq('proposal_id', params.id).order('position'),
        supabaseAdmin.from('proposal_bonds').select('*').eq('proposal_id', params.id).order('position'),
        supabaseAdmin.from('proposal_equities').select('*').eq('proposal_id', params.id).order('position'),
      ])

    if (pErr) throw pErr
    return NextResponse.json({ proposal, funds: funds ?? [], bonds: bonds ?? [], equities: equities ?? [] })
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
    const fields = ['title', 'client_id', 'client_name', 'client_email', 'total_amount', 'currency', 'status', 'notes', 'disclaimer', 'sent_at', 'shared_with_all']
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f]
    }

    const { data, error } = await supabaseAdmin
      .from('investment_proposals')
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { error } = await supabaseAdmin
      .from('investment_proposals')
      .delete()
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
