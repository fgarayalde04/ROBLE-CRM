import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clientName = searchParams.get('client') ?? ''

    let query = supabaseAdmin
      .from('factsheets')
      .select('id, client_name, report_date, quarter, advisor, total_value, risk_profile, created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (clientName) query = query.ilike('client_name', `%${clientName}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()

    const { data, error } = await supabaseAdmin
      .from('factsheets')
      .insert({
        client_name:   body.meta?.clientName ?? '',
        report_date:   body.meta?.reportDate ?? new Date().toISOString().split('T')[0],
        quarter:       body.meta?.quarter    ?? '',
        advisor:       body.meta?.advisor    ?? session.email ?? '',
        benchmark:     body.meta?.benchmark  ?? '',
        total_value:   body.totalValue       ?? 0,
        risk_score:    body.riskScore        ?? null,
        risk_profile:  body.riskProfile      ?? '',
        data:          body,
        created_by:    session.id,
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await supabaseAdmin.from('factsheets').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
