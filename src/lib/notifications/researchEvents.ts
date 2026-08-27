import { createNotification, markAllUnreadByType } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'

const ALL_ROLES = ['admin', 'ceo', 'direccion', 'asesor', 'asistente', 'compliance']

// Morning Brief: notificación interna únicamente — sin push por ahora (spec explícita).
// Solo debe quedar visible el del día que llega: si alguien no abrió la app en
// varios días, antes se le acumulaba una notificación sin leer por cada uno.
// Por eso, antes de crear la nueva, se marcan leídas todas las anteriores sin
// abrir — así el conteo de no leídas nunca pasa de 1 para este tipo.
export async function notifyMorningBriefPublished(postId: string, briefDate: string) {
  await markAllUnreadByType('morning_brief')
  const recipients = await getUsersByRoles(ALL_ROLES)
  await Promise.all(recipients.map((r) => createNotification({
    userId: r.id,
    userName: r.name,
    notifType: 'morning_brief',
    title: '📰 Morning Brief disponible',
    message: `Morning Brief — ${briefDate}`,
    entityType: 'research',
    entityId: postId,
    url: `/research?open=${postId}`,
  })))
}
