import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendPushNotification } from '@/lib/push/server'

// POST /api/push/test — sends a push to the CALLER only. Never accepts a
// target userId from the client, so a user can never push to someone else.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const result = await sendPushNotification({
      userId: session.id,
      title: 'Roble Capital',
      body: 'Las notificaciones están funcionando correctamente.',
      url: '/',
      type: 'test',
    })

    if (result.sent === 0) {
      return NextResponse.json(
        { error: 'No hay ningún dispositivo activo para enviar la prueba.', result },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
