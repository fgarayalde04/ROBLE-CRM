'use server'

import { isAprobacionToken } from '@/lib/aprobacion'
import { getSolicitudByAprobacionToken, registrarAprobacionCliente, insertSolicitudEvento } from '@/lib/db/solicitudes'
import { notifyClienteAprobacion } from '@/lib/notifications/orderEvents'

export interface AprobacionResult {
  ok: boolean
  error?: string
  decision?: 'aprobada' | 'rechazada'
  yaRespondida?: boolean
}

const COMENTARIO_MAX = 2000

export async function responderOrden(
  token: string,
  decision: 'aprobada' | 'rechazada',
  comentarioRaw: string,
): Promise<AprobacionResult> {
  if (!isAprobacionToken(token)) return { ok: false, error: 'Link inválido.' }
  if (decision !== 'aprobada' && decision !== 'rechazada') return { ok: false, error: 'Elegí Apruebo o No apruebo.' }
  const comentario = comentarioRaw.trim().slice(0, COMENTARIO_MAX) || null

  const sol = await registrarAprobacionCliente(token, decision, comentario)
  if (!sol) {
    const existing = await getSolicitudByAprobacionToken(token)
    if (!existing) return { ok: false, error: 'No encontramos esta orden. Contactá a tu asesor.' }
    return { ok: true, yaRespondida: true, decision: existing.aprobacion_cliente }
  }

  const client = sol.client_name ?? 'El cliente'
  await insertSolicitudEvento({
    solicitud_id: sol.id,
    tipo: decision === 'aprobada' ? 'cliente_aprobo' : 'cliente_rechazo',
    descripcion: `${client} ${decision === 'aprobada' ? 'aprobó' : 'no aprobó'} la orden desde el mail${comentario ? `: "${comentario}"` : '.'}`,
    usuario: client,
    usuario_id: null,
    datos: { decision, comentario },
  })

  try {
    await notifyClienteAprobacion(
      { id: sol.id, clientName: sol.client_name ?? null, asesorName: sol.asesor, asesorId: sol.asesor_id ?? null },
      decision,
      comentario,
    )
  } catch (err: any) {
    // La respuesta ya quedó guardada y en el historial; el aviso es best-effort.
    console.error('[aprobar] No se pudo notificar:', err.message)
  }

  return { ok: true, decision }
}
