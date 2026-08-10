import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getOrderItemOwner, updateOrderItemDone } from '@/lib/db/ordenes'

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

  const owner = await getOrderItemOwner(params.id)
  if (!owner) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!isAdmin && owner.userName !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const data = await updateOrderItemDone(params.id, done, session.name)
  return NextResponse.json(data)
}
