import { createNotification, markAllUnreadByType } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'
import { sendPushNotification } from '@/lib/push/server'

const ALL_ROLES = ['admin', 'ceo', 'direccion', 'asesor', 'asistente', 'compliance']

// Morning Brief: notificación interna + push a todos los roles.
// Solo debe quedar visible el del día que llega: si alguien no abrió la app en
// varios días, antes se le acumulaba una notificación sin leer por cada uno.
// Por eso, antes de crear la nueva, se marcan leídas todas las anteriores sin
// abrir — así el conteo de no leídas nunca pasa de 1 para este tipo.
export async function notifyMorningBriefPublished(postId: string, briefDate: string) {
  await markAllUnreadByType('morning_brief')
  const recipients = await getUsersByRoles(ALL_ROLES)
  const title = '📰 Morning Brief disponible'
  const message = `Morning Brief — ${briefDate}`
  const url = `/research?open=${postId}`

  await Promise.all(recipients.map(async (r) => {
    const created = await createNotification({
      userId: r.id,
      userName: r.name,
      notifType: 'morning_brief',
      title,
      message,
      entityType: 'research',
      entityId: postId,
      url,
    })

    // created === null significa que esta notificación ya existía (dedup) —
    // no reenviar push tampoco, evita duplicados en ambos frentes.
    if (created) {
      try {
        await sendPushNotification({
          userId: r.id,
          title,
          body: message,
          url,
          type: 'morning_brief',
          entityId: postId,
        })
      } catch (err) {
        // Push es best-effort — la notificación interna ya quedó guardada.
        console.error('[researchEvents] push failed', err)
      }
    }
  }))
}

// Reenvío manual del push del Morning Brief (botón en Research, solo
// admin/ceo/dirección) — a diferencia de notifyMorningBriefPublished(), NO
// pasa por createNotification ni su dedup: la notificación interna ya existe
// (o el usuario ya la vio), esto solo vuelve a mandar el push en sí, por si
// no llegó la primera vez.
export async function resendMorningBriefPush(postId: string, briefDate: string) {
  const recipients = await getUsersByRoles(ALL_ROLES)
  const title = '📰 Morning Brief disponible'
  const message = `Morning Brief — ${briefDate}`
  const url = `/research?open=${postId}`

  const results = await Promise.all(recipients.map(async (r) => {
    try {
      const res = await sendPushNotification({
        userId: r.id, title, body: message, url, type: 'morning_brief', entityId: postId,
      })
      return res.sent
    } catch (err) {
      console.error('[researchEvents] resend push failed', r.id, err)
      return 0
    }
  }))

  return { recipients: recipients.length, sent: results.reduce((a, b) => a + b, 0) }
}
