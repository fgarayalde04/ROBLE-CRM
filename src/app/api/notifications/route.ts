import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listNotificationsForUser, getUnreadCount } from '@/lib/db/notifications'

// GET /api/notifications — the caller's own notifications only.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(session.id, session.name, 30),
    getUnreadCount(session.id, session.name),
  ])

  return NextResponse.json({ notifications, unreadCount })
}
