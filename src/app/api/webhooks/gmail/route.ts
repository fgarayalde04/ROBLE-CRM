import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { processMesaInbox, isReplyWatchEnabled } from '@/lib/mailWatch/processMesaInbox'
import { MESA_GOOGLE_CONNECTION_KEY } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function tokenMatches(given: string | null): boolean {
  const expected = process.env.GMAIL_PUSH_TOKEN
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>
 * Destino de la suscripción push de Pub/Sub sobre el topic que usa el watch de
 * Gmail (ver /api/cron/gmail-watch). Pub/Sub llama acá en cuanto entra un mail
 * a trading@. El aviso solo trae {emailAddress, historyId} — no se confía en
 * él para nada más que "despertar": lo nuevo se lee de Gmail desde el último
 * historyId guardado. Autenticación: token secreto en la URL de la suscripción
 * (el middleware deja pasar esta ruta sin sesión).
 *
 * Responde 2xx cuando el aviso quedó atendido (Pub/Sub deja de reintentar) y
 * 500 si falló (Pub/Sub reintenta solo).
 */
export async function POST(req: NextRequest) {
  if (!tokenMatches(req.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Apagado (p. ej. en desarrollo): se confirma para que Pub/Sub no reintente en bucle.
  if (!isReplyWatchEnabled()) return NextResponse.json({ ok: true, skipped: true })

  try {
    const body = await req.json()
    const encoded: string | undefined = body?.message?.data
    const payload = encoded ? JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) : null
    // Otra casilla (o un mensaje de prueba sin datos): nada que hacer.
    if (payload?.emailAddress && String(payload.emailAddress).toLowerCase() !== MESA_GOOGLE_CONNECTION_KEY) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    return NextResponse.json(await processMesaInbox('push'))
  } catch (err: any) {
    console.error('[webhooks/gmail] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
