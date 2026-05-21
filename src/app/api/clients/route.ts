import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''

    let query = supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name, client_number, status')
      .eq('status', 'activo')
      .order('last_name')
      .limit(20)

    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,client_number.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert(payload)
      .select()
      .single()
    if (error) throw error

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'client',
      entity_id: data.id,
      action: 'crear',
      description: `Cliente ${payload.first_name} ${payload.last_name} creado`,
    })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...payload } = await req.json()
    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabaseAdmin.from('clients').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
