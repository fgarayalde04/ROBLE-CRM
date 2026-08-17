import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getUnreadCount } from '@/lib/db/research'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const unreadCount = await getUnreadCount(session.id)
  return NextResponse.json({ unreadCount })
}
