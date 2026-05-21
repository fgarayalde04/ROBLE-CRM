import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert(payload)
      .select()
      .single()
    if (error) throw error

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'document',
      entity_id: data.id,
      action: 'crear',
      description: `Documento "${payload.name}" creado`,
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
      .from('documents')
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
    const { error } = await supabaseAdmin.from('documents').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
