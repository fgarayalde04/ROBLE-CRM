import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/ordenes/[id] — single order with items
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

  // Permission check
  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Fetch items
  const { data: items } = await supabaseAdmin
    .from('order_history_items')
    .select('*')
    .eq('order_id', params.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...entry, items: items ?? [] })
}
