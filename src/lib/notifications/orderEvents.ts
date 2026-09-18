// Órdenes → notificación interna (siempre) + push (solo 4 eventos) ────────────
// Reutiliza createNotification (dedup) y sendPushNotification — no es una
// segunda infraestructura de notificaciones, solo la lógica específica de
// "qué evento de Órdenes le corresponde a quién".

import { createNotification } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'
import { sendPushNotification } from '@/lib/push/server'

const MESA_ROLES = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']

export interface OrderCtx {
  id: string                 // solicitud uuid — entity_id
  clientName: string | null
  asesorName: string
  asesorId: string | null
}

function orderUrl(id: string) {
  return `/solicitudes?open=${id}`
}

async function notifyAndMaybePush(opts: {
  userId: string | null
  userName: string
  notifType: string
  title: string
  message: string
  clientName: string | null
  entityId: string
  entityType?: string
  url: string
  push?: { title: string; body: string; tag?: string }
}) {
  const created = await createNotification({
    userId: opts.userId,
    userName: opts.userName,
    notifType: opts.notifType,
    title: opts.title,
    message: opts.message,
    clientName: opts.clientName,
    entityType: opts.entityType ?? 'solicitud',
    entityId: opts.entityId,
    url: opts.url,
  })

  // created === null means this exact (orden + evento + destinatario) ya existía
  // — no reenviar push tampoco, evita duplicados en ambos frentes.
  if (created && opts.push && opts.userId) {
    try {
      await sendPushNotification({
        userId: opts.userId,
        title: opts.push.title,
        body: opts.push.body,
        url: opts.url,
        type: opts.notifType,
        entityId: opts.entityId,
        tag: opts.push.tag,
      })
    } catch (err) {
      // Push es best-effort — la notificación interna ya quedó guardada.
      console.error('[orderEvents] push failed', opts.notifType, err)
    }
  }
}

// 1. Nueva orden para revisión — Mesa/admin/asistentes — interna + push
export async function notifyNuevaOrden(order: OrderCtx) {
  const client = order.clientName ?? 'Cliente'
  const recipients = await getUsersByRoles(MESA_ROLES)
  await Promise.all(recipients.map((r) => notifyAndMaybePush({
    userId: r.id,
    userName: r.name,
    notifType: 'orden_nueva',
    title: '📥 Nueva orden para revisar',
    message: `${client} — enviada por ${order.asesorName}`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    push: { title: '📥 Nueva orden', body: `${order.asesorName} envió una nueva orden de ${client}.` },
  })))
}

// 2. Orden tomada — asesor — interna + push
export async function notifyOrdenTomada(order: OrderCtx, operadorName: string) {
  if (!order.asesorId) return
  const client = order.clientName ?? 'Cliente'
  await notifyAndMaybePush({
    userId: order.asesorId,
    userName: order.asesorName,
    notifType: 'orden_tomada',
    title: 'Orden tomada',
    message: `${operadorName} está revisando la orden de ${client}.`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    push: { title: '👤 Orden tomada', body: `${operadorName} tomó la orden de ${client}.` },
  })
}

// 3. Orden devuelta / requiere corrección — asesor — interna solamente
export async function notifyOrdenDevuelta(order: OrderCtx, motivo?: string | null) {
  if (!order.asesorId) return
  const client = order.clientName ?? 'Cliente'
  await notifyAndMaybePush({
    userId: order.asesorId,
    userName: order.asesorName,
    notifType: 'orden_devuelta',
    title: '⚠️ Orden requiere corrección',
    message: `La orden de ${client} necesita una corrección.${motivo ? ` "${motivo}"` : ''}`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    // sin push — decisión explícita
  })
}

// 4. Mail enviado — asesor — interna + push
export async function notifyMailEnviado(order: OrderCtx) {
  if (!order.asesorId) return
  const client = order.clientName ?? 'Cliente'
  await notifyAndMaybePush({
    userId: order.asesorId,
    userName: order.asesorName,
    notifType: 'orden_mail_enviado',
    title: '📧 Mail enviado',
    message: `La orden de ${client} fue enviada al cliente.`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    push: { title: '📧 Mail enviado', body: `El mail de la orden de ${client} fue enviado al cliente.` },
  })
}

// 5. En ejecución — asesor — interna solamente
export async function notifyEnEjecucion(order: OrderCtx) {
  if (!order.asesorId) return
  const client = order.clientName ?? 'Cliente'
  await notifyAndMaybePush({
    userId: order.asesorId,
    userName: order.asesorName,
    notifType: 'orden_en_ejecucion',
    title: 'Orden en ejecución',
    message: `La orden de ${client} está siendo ejecutada.`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    // sin push — decisión explícita
  })
}

// 6. Ejecutada — asesor — interna + push. El dedup por (entityId, notifType,
// userName) ya garantiza que una edición posterior de la orden no vuelva a
// disparar esta notificación.
export async function notifyOrdenEjecutada(order: OrderCtx) {
  if (!order.asesorId) return
  const client = order.clientName ?? 'Cliente'
  await notifyAndMaybePush({
    userId: order.asesorId,
    userName: order.asesorName,
    notifType: 'orden_ejecutada',
    title: '✅ Orden ejecutada',
    message: `La operación de ${client} fue ejecutada correctamente.`,
    clientName: order.clientName,
    entityId: order.id,
    url: orderUrl(order.id),
    push: { title: '✅ Orden ejecutada', body: `La operación de ${client} fue ejecutada correctamente.` },
  })
}

// ─── Respuestas de clientes en trading@ ──────────────────────────────────────

export interface ReplyCtx {
  replyId: string                              // email_replies.id — entity_id de la notificación
  solicitudId: string | null                   // orden uuid — null si no se pudo asociar a ninguna
  threadId: string                             // hilo de Gmail — agrupa los push del mismo hilo
  clientName: string | null
  fromEmail: string
  subject: string
  snippet: string
  matchMethod: 'thread_id' | 'subject_fallback' | 'unmatched'
}

const PUSH_SNIPPET_MAX = 110

// "Re: Confirmacion de orden - 1234 - 2026-09-18" → "Confirmacion de orden - 1234 - 2026-09-18"
function cleanSubject(subject: string) {
  return subject.replace(/^\s*((re|rv|fwd|fw)\s*:\s*)+/i, '').trim()
}

// Gmail devuelve el snippet con entidades HTML (&#39; &amp; ...) y espacios raros.
function cleanSnippet(snippet: string) {
  const text = snippet
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
  return text.length > PUSH_SNIPPET_MAX ? `${text.slice(0, PUSH_SNIPPET_MAX - 1).trimEnd()}…` : text
}

// El cliente respondió un mail enviado desde trading@ — interna + push, al
// instante. entity_id es el id de la respuesta (email_replies.id), NO el de la
// orden: si el cliente responde varias veces, cada respuesta es un mensaje de
// Gmail distinto y debe generar su propia notificación — con el id de la orden
// chocaría con el dedup (entity_id, notif_type, user_name) y la segunda se perdería.
//
// Destinatarios: el asesor dueño de la orden (solo ve las respuestas de sus
// clientes) + toda la Mesa/admin/asistentes (ven todo, incluidas las que no se
// pudieron asociar a una orden, para revisarlas a mano). Si el asesor además
// tiene rol de Mesa, el dedup hace que reciba una sola.
export async function notifyClienteRespondio(reply: ReplyCtx, asesor: { id: string | null; name: string } | null) {
  const isUnmatched = reply.matchMethod === 'unmatched'
  const who = reply.clientName ?? reply.fromEmail
  const subject = cleanSubject(reply.subject)
  const preview = cleanSnippet(reply.snippet)
  const suffix = reply.matchMethod === 'subject_fallback' ? ' (asociada por asunto)' : ''

  const title = isUnmatched ? '💬 Respuesta sin identificar' : `💬 ${who} respondió`
  const message = isUnmatched
    ? `${reply.fromEmail} respondió "${subject}" y no se pudo asociar a ninguna orden — revisar manualmente.`
    : `${who} respondió al mail de su orden: "${subject}".${suffix}`
  const url = reply.solicitudId ? orderUrl(reply.solicitudId) : '/solicitudes'
  const push = {
    title,
    // Subject arriba, extracto de lo que escribió abajo — se entiende sin abrir el CRM.
    body: preview ? `${subject}\n${preview}` : subject,
    tag: `mail-reply-${reply.threadId}`,
  }

  const common = {
    notifType: 'cliente_respondio',
    title,
    message,
    clientName: reply.clientName,
    entityId: reply.replyId,
    entityType: 'email_reply',
    url,
    push,
  }

  const recipients = new Map<string, string>()
  if (reply.solicitudId && asesor?.id) recipients.set(asesor.id, asesor.name)
  for (const r of await getUsersByRoles(MESA_ROLES)) recipients.set(r.id, r.name)

  await Promise.all(Array.from(recipients, ([userId, userName]) =>
    notifyAndMaybePush({ ...common, userId, userName })
  ))
}
