import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('opening_tasks')
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
      .from('opening_tasks')
      .insert({
        opening_id: context.params.id,
        title: body.title,
        description: body.description ?? null,
        responsible: body.responsible ?? null,
        due_date: body.due_date ?? null,
        priority: body.priority ?? 'normal',
        status: body.status ?? 'pendiente',
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

    if (updates.status === 'completada' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('opening_tasks')
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
