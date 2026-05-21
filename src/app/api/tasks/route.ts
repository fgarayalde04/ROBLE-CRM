import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const responsible = searchParams.get('responsible')
    const status = searchParams.get('status')
    const client_id = searchParams.get('client_id')
    const opening_id = searchParams.get('opening_id')
    const q = searchParams.get('q')

    let query = supabaseAdmin
      .from('tasks')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .order('due_date', { ascending: true, nullsFirst: false })

    if (responsible) query = query.eq('responsible', responsible)
    if (status) query = query.eq('status', status)
    if (client_id) query = query.eq('client_id', client_id)
    if (opening_id) query = query.eq('opening_id', opening_id)
    if (q) query = query.ilike('title', `%${q}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert(body)
      .select()
      .single()

    if (error) throw error

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'task',
      entity_id: data.id,
      action: 'crear',
      description: `Tarea "${data.title}" creada`,
    })

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...updates } = await req.json()

    if (updates.status === 'completado' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
