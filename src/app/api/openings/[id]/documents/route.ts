import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('opening_documents')
      .select('*')
      .eq('opening_id', context.params.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const body = await req.json()

    const { data, error } = await supabaseAdmin
      .from('opening_documents')
      .insert({
        opening_id: context.params.id,
        name: body.name,
        category: body.category ?? null,
        link: body.link ?? null,
        status: body.status ?? 'pendiente',
        expiry_date: body.expiry_date ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request, context: { params: { id: string } }) {
  try {
    const { id, ...updates } = await req.json()

    const { data, error } = await supabaseAdmin
      .from('opening_documents')
      .update(updates)
      .eq('id', id)
      .eq('opening_id', context.params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
