import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { data, error } = await supabaseAdmin
      .from('deadlines')
      .insert(payload)
      .select()
      .single()
    if (error) throw error

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'deadline',
      entity_id: data.id,
      action: 'crear',
      description: `Vencimiento "${payload.title}" creado`,
    }).throwOnError()

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...payload } = await req.json()
    const { data, error } = await supabaseAdmin
      .from('deadlines')
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
    const { error } = await supabaseAdmin.from('deadlines').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
