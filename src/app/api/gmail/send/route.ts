import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { logActivity } from '@/lib/db/activityLog'
import {
  getValidMesaGoogleToken, invalidateMesaGoogleToken, MESA_GOOGLE_CONNECTION_KEY,
  getValidGoogleToken, getGoogleEmail, getGoogleName,
} from '@/lib/google/tokens'
import { sendEmail } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { to, cc, subject, body, replyTo, viaMesa } = await req.json()
  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject y body son requeridos' }, { status: 400 })
  }

  // viaMesa: true solo para confirmaciones de orden (Solicitudes / Enviar
  // órdenes) — ahí sí se envía realmente desde trading@roblecapital.net, así
  // el mail queda guardado en su carpeta de Enviados. La sección normal de
  // Mail (plantillas sueltas) sigue mandando desde la cuenta personal de
  // quien esté logueado, con su propio nombre — mezclar el nombre "Mesa de
  // Operaciones" con una dirección personal es justamente lo que hacía que
  // Gmail/Outlook del cliente lo marcaran como spam (nombre corporativo +
  // dirección que no matchea, patrón típico de suplantación).
  let accessToken: string | null
  let fromHeader: string
  let effectiveReplyTo: string | undefined

  if (viaMesa) {
    accessToken = await getValidMesaGoogleToken()
    if (!accessToken) {
      return NextResponse.json({
        error: 'La casilla de Mesa (trading@roblecapital.net) no está conectada. Un administrador debe conectarla en Configuración.',
      }, { status: 403 })
    }
    const tradingName = process.env.TRADING_NAME ?? 'Mesa de Operaciones | Roble Capital'
    fromHeader = `"${tradingName}" <${MESA_GOOGLE_CONNECTION_KEY}>`
    effectiveReplyTo = replyTo ?? MESA_GOOGLE_CONNECTION_KEY
  } else {
    accessToken = await getValidGoogleToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Conectá tu cuenta Google para enviar emails.' }, { status: 403 })
    }
    const senderEmail = await getGoogleEmail()
    if (!senderEmail) {
      return NextResponse.json({ error: 'No se pudo obtener el email del remitente.' }, { status: 403 })
    }
    const senderName = (await getGoogleName()) ?? session.name
    fromHeader = `"${senderName}" <${senderEmail}>`
    effectiveReplyTo = replyTo ?? undefined
  }

  async function trySend(token: string) {
    return sendEmail(token, { from: fromHeader, to, cc, subject, body, replyTo: effectiveReplyTo })
  }

  try {
    let message
    try {
      message = await trySend(accessToken)
    } catch (err: any) {
      // Gmail puede rechazar con 401 un token que localmente todavía parecía
      // vigente (revocado, reloj desincronizado) — forzar un refresh real y
      // reintentar una vez antes de darnos por vencidos. Solo aplica a la
      // casilla de Mesa: el token personal ya se refresca solo en getValidGoogleToken().
      if (err.status === 401 && viaMesa) {
        await invalidateMesaGoogleToken()
        const freshToken = await getValidMesaGoogleToken()
        if (!freshToken) throw err
        message = await trySend(freshToken)
      } else {
        throw err
      }
    }

    const toStr = Array.isArray(to) ? to.join(', ') : to
    await logActivity({
      entity_type: 'system',
      entity_id:   null,
      action:      'email_enviado',
      description: `Plantilla enviada a ${toStr}: ${subject}`,
      user_name:   session.name,
    })

    return NextResponse.json({ ok: true, message_id: message.id, thread_id: message.threadId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
