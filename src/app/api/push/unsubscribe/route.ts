import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { disablePushSubscription } from '@/lib/db/pushSubscriptions'

// POST /api/push/unsubscribe — only ever touches the caller's own subscriptions
// (scoped by session.id, the endpoint alone isn't enough to authorize the change).
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { endpoint } = body ?? {}
  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'endpoint requerido' }, { status: 400 })
  }

  await disablePushSubscription(session.id, endpoint)
  return NextResponse.json({ ok: true })
}
