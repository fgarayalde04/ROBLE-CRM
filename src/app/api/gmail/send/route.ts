import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { logActivity } from '@/lib/db/activityLog'
import {
  getValidMesaGoogleToken, invalidateMesaGoogleToken, MESA_GOOGLE_CONNECTION_KEY,
  getValidGoogleToken, getGoogleEmail, getGoogleName,
} from '@/lib/google/tokens'
import { sendEmail } from '@/lib/google/gmail'
import { getSolicitud, ensureAprobacionToken } from '@/lib/db/solicitudes'
import { newAprobacionToken, buildAprobacionEmail } from '@/lib/aprobacion'
import { getActiveUserEmail } from '@/lib/db/users'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { to, cc, subject, body, replyTo, viaMesa, solicitud_uuid, con_aprobacion } = await req.json()
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
  let asesorEmail: string | null = null

  if (viaMesa) {
    accessToken = await getValidMesaGoogleToken()
    if (!accessToken) {
      return NextResponse.json({
        error: 'La casilla de Mesa (trading@roblecapital.net) no está conectada. Un administrador debe conectarla en Configuración.',
      }, { status: 403 })
    }
    const tradingName = process.env.TRADING_NAME ?? 'Trading Desk | Roble Capital'
    fromHeader = `"${tradingName}" <${MESA_GOOGLE_CONNECTION_KEY}>`
    // Reply-To: siempre trading@ + el asesor dueño de la orden — así la
    // respuesta del cliente le llega directo a los dos, no solo a la casilla
    // compartida. Si la manda Mesa, el asesor sale de la orden (solicitud_uuid);
    // si no hay orden asociada, quien envía es el asesor.
    asesorEmail = session.email ?? null
    if (solicitud_uuid) {
      try {
        const sol = await getSolicitud(solicitud_uuid)
        if (sol?.asesor_id) asesorEmail = (await getActiveUserEmail(sol.asesor_id)) ?? asesorEmail
      } catch (err: any) {
        // No trabar el envío por esto: queda quien envía como Reply-To.
        console.error('[gmail/send] No se pudo obtener el asesor de la orden:', err.message)
      }
    }
    effectiveReplyTo = Array.from(new Set(
      [MESA_GOOGLE_CONNECTION_KEY, asesorEmail].filter(Boolean).map((e) => e!.toLowerCase())
    )).join(', ')
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

  // Mail de orden (desde trading@): lleva los botones Apruebo / No apruebo
  // (ver src/lib/aprobacion.ts). Con solicitud_uuid (lo manda Mesa) la
  // referencia queda guardada en la orden; con con_aprobacion (envío directo
  // del asesor, la orden todavía no existe) se devuelve para guardarla al registrarla.
  let aprobacionToken: string | null = null
  let mailText: string = body
  let mailHtml: string | undefined
  if (viaMesa && (solicitud_uuid || con_aprobacion)) {
    try {
      aprobacionToken = solicitud_uuid
        ? await ensureAprobacionToken(solicitud_uuid, newAprobacionToken())
        : newAprobacionToken()
      if (aprobacionToken) {
        const built = buildAprobacionEmail({
          body, subject, replyTo: MESA_GOOGLE_CONNECTION_KEY, asesorEmail, ref: aprobacionToken,
        })
        mailText = built.text
        mailHtml = built.html
      }
    } catch (err: any) {
      // Sin botones antes que sin mail: el cliente igual puede responder.
      console.error('[gmail/send] No se pudo preparar la aprobación:', err.message)
      aprobacionToken = null
    }
  }

  async function trySend(token: string) {
    return sendEmail(token, { from: fromHeader, to, cc, subject, body: mailText, html: mailHtml, replyTo: effectiveReplyTo })
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

    return NextResponse.json({ ok: true, message_id: message.id, thread_id: message.threadId, aprobacion_token: aprobacionToken })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
