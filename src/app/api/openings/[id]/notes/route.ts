import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('opening_notes')
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
    const { text, author } = body

    const { data, error } = await supabaseAdmin
      .from('opening_notes')
      .insert({
        opening_id: context.params.id,
        text,
        author: author ?? null,
        status: 'abierta',
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
      .from('opening_notes')
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
