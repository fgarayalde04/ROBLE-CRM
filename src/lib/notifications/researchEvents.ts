import { createNotification } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'

const ALL_ROLES = ['admin', 'ceo', 'direccion', 'asesor', 'asistente', 'compliance']

// Morning Brief: notificación interna únicamente — sin push por ahora (spec explícita).
export async function notifyMorningBriefPublished(postId: string, briefDate: string) {
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
