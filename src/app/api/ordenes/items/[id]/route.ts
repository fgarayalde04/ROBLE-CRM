import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// PATCH /api/ordenes/items/[id] — toggle done status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { done } = await req.json()
  if (typeof done !== 'boolean') {
    return NextResponse.json({ error: 'done debe ser boolean' }, { status: 400 })
  }

  // ── Permission check ──
  // Fetch the item → get order_id → check order owner
  const { data: item } = await supabaseAdmin
    .from('order_history_items')
    .select('order_id')
    .eq('id', params.id)
    .single()

  if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!isAdmin) {
    const { data: order } = await supabaseAdmin
      .from('order_history')
      .select('user_name')
      .eq('id', item.order_id)
      .single()

    if (!order || order.user_name !== session.name) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
  }

  // ── Update ──
  const { data, error } = await supabaseAdmin
    .from('order_history_items')
    .update({
      done,
      done_by: done ? session.name : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq('id', params.id)
    .select('id, done, done_by, done_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
