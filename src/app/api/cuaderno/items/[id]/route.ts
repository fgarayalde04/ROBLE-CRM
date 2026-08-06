import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

// PATCH /api/cuaderno/items/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, any> = {}

  if ('done' in body) {
    updates.done    = body.done
    updates.done_at = body.done ? new Date().toISOString() : null
  }
  if ('title'       in body) updates.title       = body.title?.trim()
  if ('comments'    in body) updates.comments    = body.comments?.trim() ?? ''
  if ('shared_with' in body) updates.shared_with = Array.isArray(body.shared_with) ? body.shared_with : []
  if ('position'    in body) updates.position    = body.position
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('cuaderno_items')
    .update(updates)
    .eq('id', params.id)
    .eq('owner_name', session.name)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

// DELETE /api/cuaderno/items/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { error } = await supabaseAdmin
    .from('cuaderno_items')
    .delete()
    .eq('id', params.id)
    .eq('owner_name', session.name)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
