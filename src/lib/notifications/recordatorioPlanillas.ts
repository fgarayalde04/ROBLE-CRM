// Recordatorio mensual (día 5) para hacer las planillas de acciones (Iche,
// Albojer) → notificación interna + push. Dedup por (mes, destinatario): se
// puede llamar varias veces y cada uno lo recibe una sola vez por mes.

import { pool } from '@/lib/db/pool'
import { createNotification } from '@/lib/db/notifications'
import { sendPushNotification } from '@/lib/push/server'

const NOTIF_TYPE = 'recordatorio_planillas'
// Por mail para no depender de ids; se cambia con PLANILLAS_REMINDER_EMAILS (separados por coma).
const DEFAULT_EMAILS = ['fgarayaldearrillaga@roblecapital.net']

// notifications.entity_id es uuid: uno fijo por mes (los dígitos del mes son hex válido).
export function recordatorioEntityId(mes: string) {
  return `9a11a000-0000-4000-8000-0000${mes.replace('-', '')}00`
}

export async function enviarRecordatorioPlanillas(mes: string) {
  const emails = (process.env.PLANILLAS_REMINDER_EMAILS?.split(',') ?? DEFAULT_EMAILS)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const { rows: users } = await pool.query<{ id: string; name: string }>(
    `select id, name from crm_users where lower(email) = any($1::text[]) and active = true`,
    [emails]
  )

  const title = '🗓️ Hacer las planillas del mes'
  const message = 'Es día 5: bajá de Pershing el Unrealized y el Activity y actualizá Iche Acciones y Análisis Albojer.'
  const url = '/admin/planillas'
  let enviados = 0
  for (const u of users) {
    const created = await createNotification({
      userId: u.id,
      userName: u.name,
      notifType: NOTIF_TYPE,
      title,
      message,
      clientName: null,
      entityType: 'planillas',
      entityId: recordatorioEntityId(mes),
      url,
    })
    if (!created) continue // ya se le avisó este mes
    enviados++
    try {
      await sendPushNotification({ userId: u.id, title, body: message, url, type: NOTIF_TYPE, entityId: recordatorioEntityId(mes), tag: `planillas-${mes}` })
    } catch (err) {
      // Push es best-effort — la notificación interna ya quedó guardada.
      console.error('[recordatorio-planillas] push failed', u.name, err)
    }
  }
  return { mes, enviados, destinatarios: users.length }
}
