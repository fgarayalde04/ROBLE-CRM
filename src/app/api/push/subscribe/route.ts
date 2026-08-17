import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { upsertPushSubscription } from '@/lib/db/pushSubscriptions'

// POST /api/push/subscribe — always ties the subscription to the caller's own session.
// A user can never register a subscription on behalf of someone else.
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { endpoint, p256dh, auth, userAgent } = body ?? {}

  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'endpoint inválido' }, { status: 400 })
  }
  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) {
    return NextResponse.json({ error: 'Claves de suscripción inválidas' }, { status: 400 })
  }

  const row = await upsertPushSubscription({
    userId: session.id,
    endpoint,
    p256dh,
    auth,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
  })

  return NextResponse.json({ ok: true, id: row.id })
}
