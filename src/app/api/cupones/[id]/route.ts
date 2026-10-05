import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission, isAdminRole } from '@/lib/auth'
import { deleteCouponCalendar, getCouponCalendar } from '@/lib/db/couponCalendars'

export const dynamic = 'force-dynamic'

// GET /api/cupones/[id] — calendario guardado completo (para reabrirlo y editarlo)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const row = await getCouponCalendar(params.id).catch(() => null)
  if (!row) return NextResponse.json({ error: 'Calendario no encontrado' }, { status: 404 })
  return NextResponse.json({ calendario: row })
}

// DELETE /api/cupones/[id] — quien lo generó o dirección
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'research', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const row = await getCouponCalendar(params.id).catch(() => null)
  if (!row) return NextResponse.json({ error: 'Calendario no encontrado' }, { status: 404 })
  if (row.created_by !== session.name && !isAdminRole(session.role)) {
    return NextResponse.json({ error: 'Solo quien lo generó puede borrarlo' }, { status: 403 })
  }
  await deleteCouponCalendar(params.id)
  return NextResponse.json({ ok: true })
}
