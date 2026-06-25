import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/ordenes/[id] — full detail with items
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)

  const { data: entry, error } = await supabaseAdmin
    .from('order_history')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: items } = await supabaseAdmin
    .from('order_history_items')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...entry, items: items ?? [] })
}

// DELETE /api/ordenes/[id] — hard delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)

  const { data: entry } = await supabaseAdmin
    .from('order_history')
    .select('user_name')
    .eq('id', params.id)
    .single()

  if (!entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Delete items first
  await supabaseAdmin.from('order_history_items').delete().eq('order_id', params.id)
  const { error } = await supabaseAdmin.from('order_history').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/ordenes/[id] — update confirmacion_cliente, orden_ejecutada, comentarios
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)

  // Check ownership
  const { data: entry } = await supabaseAdmin
    .from('order_history')
    .select('user_name')
    .eq('id', params.id)
    .single()

  if (!entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body    = await req.json()
  const updates: Record<string, any> = {}

  if ('confirmacion_cliente' in body) updates.confirmacion_cliente = body.confirmacion_cliente
  if ('orden_ejecutada'      in body) updates.orden_ejecutada      = body.orden_ejecutada
  if ('comentarios'          in body) updates.comentarios          = body.comentarios ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('order_history')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
