import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission, isAdminRole } from '@/lib/auth'
import { deleteConsolidado, getConsolidado } from '@/lib/db/consolidados'

export const dynamic = 'force-dynamic'

// DELETE /api/consolidado/guardados/[id] — quien lo guardó o dirección
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const row = await getConsolidado(params.id).catch(() => null)
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (row.created_by !== session.name && !isAdminRole(session.role)) {
    return NextResponse.json({ error: 'Solo quien lo guardó puede borrarlo' }, { status: 403 })
  }
  await deleteConsolidado(params.id)
  return NextResponse.json({ ok: true })
}
