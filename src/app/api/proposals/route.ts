import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('investment_proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    // Non-admin: own proposals OR shared with all
    if (session.role !== 'admin' && session.role !== 'ceo') {
      query = query.or(`advisor_id.eq.${session.id},shared_with_all.eq.true`)
    }

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
      .from('investment_proposals')
      .insert({
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
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
