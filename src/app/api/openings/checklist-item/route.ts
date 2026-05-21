import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PUT(req: Request) {
  try {
    const { id, completed, responsible, note } = await req.json()

    const updates: Record<string, unknown> = { completed, responsible, note }
    if (completed) {
      updates.completed_at = new Date().toISOString()
    } else {
      updates.completed_at = null
    }

    const { data, error } = await supabaseAdmin
      .from('opening_checklist_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
