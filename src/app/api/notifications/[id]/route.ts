import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { markNotificationRead } from '@/lib/db/notifications'

// PATCH /api/notifications/[id] — mark as read. Only the recipient can do this
// (scoped by user_id/user_name inside markNotificationRead).
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const row = await markNotificationRead(params.id, session.id, session.name)
  return NextResponse.json({ ok: true, notification: row })
}
