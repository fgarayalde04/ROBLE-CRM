import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json(null)

    const [clientRes, bcRes, fichaRes] = await Promise.all([
      supabaseAdmin.from('clients').select('*').eq('id', id).single(),
      supabaseAdmin.from('banco_central_records').select('id, type, customer_number, authorized_email').eq('client_id', id),
      supabaseAdmin.from('bc_fichas').select('ficha_data, tipo_cliente').eq('client_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    if (clientRes.error || !clientRes.data) return NextResponse.json(null)
    return NextResponse.json({
      ...clientRes.data,
      banco_central: bcRes.data ?? [],
      bc_ficha: fichaRes.data ?? null,
    })
  } catch {
    return NextResponse.json(null)
  }
}
