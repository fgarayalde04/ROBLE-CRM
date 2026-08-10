import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getOrderHistoryEntry, getOrderHistoryItems, deleteOrderHistoryEntry, updateOrderHistoryEntry } from '@/lib/db/ordenes'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/ordenes/[id] — full detail with items
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)

  const entry = await getOrderHistoryEntry(params.id)
  if (!entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const items = await getOrderHistoryItems(params.id)

  return NextResponse.json({ ...entry, items })
}

// DELETE /api/ordenes/[id] — hard delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)

  const entry = await getOrderHistoryEntry(params.id)
  if (!entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!isAdmin && entry.user_name !== session.name) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  await deleteOrderHistoryEntry(params.id)
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

  const entry = await getOrderHistoryEntry(params.id)
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

  const data = await updateOrderHistoryEntry(params.id, updates)
  return NextResponse.json(data)
}
