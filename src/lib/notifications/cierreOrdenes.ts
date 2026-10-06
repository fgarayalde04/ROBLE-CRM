// Cierre del día de Órdenes → notificación interna + push.
//   · admin y asistentes: el resumen de todas las órdenes.
//   · cada asesor: el resumen de sus órdenes.
// Dedup por (día, destinatario): se puede llamar varias veces (reinicios,
// varias réplicas) y cada uno lo recibe una sola vez.

import { pool } from '@/lib/db/pool'
import { createNotification } from '@/lib/db/notifications'
import { getUsersByRoles } from '@/lib/db/users'
import { sendPushNotification } from '@/lib/push/server'
import { getCierreDia, resumenCierre, type CierreDia } from '@/lib/db/cierreOrdenes'

export const CIERRE_ROLES = ['admin', 'asistente']
const NOTIF_TYPE = 'orden_cierre_dia'

// notifications.entity_id es uuid: uno fijo por fecha (los dígitos de la fecha son hex válido).
export function cierreEntityId(fecha: string) {
  return `c1e44e00-0000-4000-8000-0000${fecha.replace(/-/g, '')}`
}

function soloDe(c: CierreDia, userId: string): CierreDia {
  const f = (l: CierreDia['ingresadas']) => l.filter((o) => o.asesor_user_id === userId)
  return {
    fecha: c.fecha,
    ingresadas: f(c.ingresadas), ejecutadas: f(c.ejecutadas), rechazadas: f(c.rechazadas),
    canceladas: f(c.canceladas), pendientes: f(c.pendientes),
  }
}

async function avisar(user: { id: string; name: string }, fecha: string, resumen: string, todas: boolean) {
  const url = `/solicitudes/cierre?fecha=${fecha}`
  const created = await createNotification({
    userId: user.id,
    userName: user.name,
    notifType: NOTIF_TYPE,
    title: todas ? '📊 Cierre del día · todas las órdenes' : '📊 Cierre del día · tus órdenes',
    message: resumen,
    clientName: null,
    entityType: 'cierre_ordenes',
    entityId: cierreEntityId(fecha),
    url,
  })
  if (!created) return false   // ya se le avisó hoy
  try {
    await sendPushNotification({
      userId: user.id,
      title: todas ? '📊 Cierre del día · Órdenes' : '📊 Cierre del día · tus órdenes',
      body: resumen,
      url,
      type: NOTIF_TYPE,
      entityId: cierreEntityId(fecha),
      tag: `cierre-ordenes-${fecha}`,
    })
  } catch (err) {
    // Push es best-effort — la notificación interna ya quedó guardada.
    console.error('[cierre-ordenes] push failed', user.name, err)
  }
  return true
}

export async function enviarCierreDia(fecha: string) {
  const [todas, equipo] = await Promise.all([getCierreDia(fecha, null), getUsersByRoles(CIERRE_ROLES)])
  const equipoIds = new Set(equipo.map((u) => u.id))
  let enviados = 0

  const resumenTodas = resumenCierre(todas)
  if (resumenTodas) {
    for (const u of equipo) if (await avisar(u, fecha, resumenTodas, true)) enviados++
  }

  const asesorIds = Array.from(new Set(
    [...todas.ingresadas, ...todas.ejecutadas, ...todas.rechazadas, ...todas.canceladas, ...todas.pendientes]
      .map((o) => o.asesor_user_id)
      .filter((id): id is string => !!id && !equipoIds.has(id))
  ))
  if (asesorIds.length) {
    const { rows: asesores } = await pool.query<{ id: string; name: string }>(
      `select id, name from crm_users where id = any($1::uuid[]) and active = true`,
      [asesorIds]
    )
    for (const a of asesores) {
      const r = resumenCierre(soloDe(todas, a.id))
      if (r && await avisar(a, fecha, r, false)) enviados++
    }
  }

  return { fecha, enviados, equipo: equipo.length, asesores: asesorIds.length, hayMovimientos: !!resumenTodas }
}
