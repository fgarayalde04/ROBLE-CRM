import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { updateCuadernoItem, deleteCuadernoItem } from '@/lib/db/cuaderno'

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

  const item = await updateCuadernoItem(params.id, session.name, updates)
  if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, item })
}

// DELETE /api/cuaderno/items/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await deleteCuadernoItem(params.id, session.name)
  return NextResponse.json({ ok: true })
}
