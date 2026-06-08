import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('order_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    const body = await req.json()
    const { data, error } = await supabaseAdmin
      .from('order_history')
      .insert({
        user_name: session?.name ?? null,
        client_name: body.client_name ?? null,
        client_number: body.client_number ?? null,
        client_id: body.client_id ?? null,
        to_email: body.to_email ?? null,
        subject: body.subject ?? null,
        body: body.body ?? null,
        status: body.status ?? 'copiado',
        order_count: body.order_count ?? 0,
        instruments: body.instruments ?? [],
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
