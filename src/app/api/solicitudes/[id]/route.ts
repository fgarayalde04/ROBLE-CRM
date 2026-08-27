import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSolicitud, getSolicitudEventos, updateSolicitud, insertSolicitudEvento } from '@/lib/db/solicitudes'
import {
  notifyOrdenTomada, notifyOrdenDevuelta, notifyMailEnviado, notifyEnEjecucion, notifyOrdenEjecutada,
  type OrderCtx,
} from '@/lib/notifications/orderEvents'

const MESA_ROLES  = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']
const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/solicitudes/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isMesa = MESA_ROLES.includes(session.role)

  const sol = await getSolicitud(params.id)

  if (!sol) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (!isMesa && sol.asesor !== session.name)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const eventos = await getSolicitudEventos(params.id)

  return NextResponse.json({ solicitud: sol, eventos })
}

// PATCH /api/solicitudes/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isMesa  = MESA_ROLES.includes(session.role)
  const isAdmin = ADMIN_ROLES.includes(session.role)
  const body    = await req.json()
  const { accion } = body

  const sol = await getSolicitud(params.id)
  if (!sol) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  async function logEvento(tipo: string, descripcion: string, datos?: any) {
    await insertSolicitudEvento({
      solicitud_id: params.id, tipo, descripcion,
      usuario: session!.name, usuario_id: session!.id,
      ...(datos ? { datos } : {}),
    })
  }

  const orderCtx: OrderCtx = {
    id: params.id, clientName: sol.client_name, asesorName: sol.asesor, asesorId: sol.asesor_id ?? null,
  }

  // ── tomar ──────────────────────────────────────────────────────────────────
  if (accion === 'tomar') {
    if (!isMesa) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (sol.operador && !isAdmin)
      return NextResponse.json({ error: 'Ya fue tomada por ' + sol.operador }, { status: 400 })

    const nuevoEstado = (sol.estado === 'pendiente_revision' || sol.estado === 'devuelta')
      ? 'en_revision' : undefined

    const data = await updateSolicitud(params.id, {
      operador: session.name, operador_id: session.id, tomado_at: new Date().toISOString(),
      ...(nuevoEstado ? { estado: nuevoEstado } : {}),
    })

    await logEvento('tomada', `Solicitud tomada por ${session.name}${nuevoEstado ? ' — en revisión' : ''}`)
    await notifyOrdenTomada(orderCtx, session.name)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── devolver ───────────────────────────────────────────────────────────────
  if (accion === 'devolver') {
    if (!isMesa) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const data = await updateSolicitud(params.id, {
      estado: 'devuelta', operador: null, operador_id: null, tomado_at: null,
    })
    await logEvento('devuelta', `Orden devuelta al asesor por ${session.name}${body.motivo ? ': ' + body.motivo : ''}`, { motivo: body.motivo })
    await notifyOrdenDevuelta(orderCtx, body.motivo)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── generar_email ──────────────────────────────────────────────────────────
  if (accion === 'generar_email') {
    if (!isMesa) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const data = await updateSolicitud(params.id, {
      mail_asunto: body.asunto, mail_cuerpo: body.cuerpo,
      email_generado_at: new Date().toISOString(), email_generado_by: session.name,
    })
    await logEvento('email_generado', `Email generado por ${session.name}`)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── mail_enviado ───────────────────────────────────────────────────────────
  if (accion === 'mail_enviado') {
    if (!isMesa) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const data = await updateSolicitud(params.id, {
      estado: 'mail_enviado',
      mail_enviado_at: new Date().toISOString(),
      mail_enviado_by: session.name,
      ...(body.asunto ? { mail_asunto: body.asunto } : {}),
      ...(body.cuerpo ? { mail_cuerpo: body.cuerpo } : {}),
      ...(body.mail_thread_id ? { mail_thread_id: body.mail_thread_id } : {}),
      ...(body.mail_message_id ? { mail_message_id: body.mail_message_id } : {}),
    })
    await logEvento('mail_enviado', `Mail enviado al cliente por ${session.name}`)
    await notifyMailEnviado(orderCtx)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── en_ejecucion ───────────────────────────────────────────────────────────
  if (accion === 'en_ejecucion') {
    // Ordenes de envio directo: el asesor que las creo y envio el mail el
    // mismo puede llevar el ciclo completo, sin pasar por Mesa.
    const isOwnerDirecto = sol.canal === 'directo_asesor' && sol.asesor === session.name
    if (!isMesa && !isOwnerDirecto) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (sol.estado !== 'mail_enviado')
      return NextResponse.json({ error: 'Requiere mail enviado primero' }, { status: 400 })

    const data = await updateSolicitud(params.id, { estado: 'en_ejecucion' })
    await logEvento('en_ejecucion', `Operación en ejecución — registrado por ${session.name}`)
    await notifyEnEjecucion(orderCtx)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── ejecutar ───────────────────────────────────────────────────────────────
  if (accion === 'ejecutar') {
    const isOwnerDirecto = sol.canal === 'directo_asesor' && sol.asesor === session.name
    if (!isMesa && !isOwnerDirecto) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const precioEjecutado = body.precio_ejecutado != null ? Number(body.precio_ejecutado) : null
    const valorEfectivo   = body.valor_efectivo   != null ? Number(body.valor_efectivo)   : null
    const now = new Date().toISOString()

    const data = await updateSolicitud(params.id, {
      estado: 'ejecutada', ejecutado_at: now, ejecutado_by: session.name,
      precio_ejecutado: precioEjecutado, valor_efectivo: valorEfectivo,
    })
    await logEvento('ejecutada',
      `Operación ejecutada por ${session.name}${precioEjecutado ? ` a precio ${precioEjecutado}` : ''}`,
      { precio_ejecutado: precioEjecutado, valor_efectivo: valorEfectivo }
    )
    await notifyOrdenEjecutada(orderCtx)
    return NextResponse.json({ ok: true, row: data })
  }

  // ── cancelar ───────────────────────────────────────────────────────────────
  if (accion === 'cancelar') {
    const isOwner = sol.asesor === session.name
    if (!isMesa && !isOwner) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const data = await updateSolicitud(params.id, {
      estado: 'cancelada', cancelado_at: new Date().toISOString(),
      cancelado_by: session.name, cancelado_motivo: body.motivo ?? null,
    })
    await logEvento('cancelada', `Solicitud cancelada por ${session.name}${body.motivo ? ': ' + body.motivo : ''}`, { motivo: body.motivo })
    return NextResponse.json({ ok: true, row: data })
  }

  // ── cancelar_item ──────────────────────────────────────────────────────────
  // Cancela un activo puntual dentro de una solicitud con varios activos, sin
  // afectar al resto. Si la solicitud tiene un solo activo (o ninguno en
  // assets_json), equivale a cancelar la solicitud completa.
  if (accion === 'cancelar_item') {
    if (!isMesa) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const itemIndex = Number(body.itemIndex)
    const assets = Array.isArray(sol.assets_json) ? [...sol.assets_json] : []

    if (assets.length <= 1) {
      const data = await updateSolicitud(params.id, {
        estado: 'cancelada', cancelado_at: new Date().toISOString(),
        cancelado_by: session.name, cancelado_motivo: body.motivo ?? null,
      })
      await logEvento('cancelada', `Solicitud cancelada por ${session.name}${body.motivo ? ': ' + body.motivo : ''}`, { motivo: body.motivo })
      return NextResponse.json({ ok: true, row: data })
    }

    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= assets.length) {
      return NextResponse.json({ error: 'itemIndex inválido' }, { status: 400 })
    }

    const target = assets[itemIndex]
    const label = target?.type === 'acciones' ? (target.nombre || target.ticker)
      : target?.type === 'fondos' ? target.fondo
      : target?.descripcion || `activo #${itemIndex + 1}`

    assets[itemIndex] = {
      ...target,
      cancelada: true,
      cancelado_at: new Date().toISOString(),
      cancelado_by: session.name,
      cancelado_motivo: body.motivo ?? null,
    }

    const allCancelled = assets.every((a: any) => a.cancelada)
    const updates: Record<string, any> = { assets_json: JSON.stringify(assets) }
    if (allCancelled) {
      updates.estado = 'cancelada'
      updates.cancelado_at = new Date().toISOString()
      updates.cancelado_by = session.name
      updates.cancelado_motivo = 'Todos los activos fueron cancelados individualmente'
    }

    const data = await updateSolicitud(params.id, updates)
    await logEvento(
      'item_cancelado',
      `${label} cancelado por ${session.name}${body.motivo ? ': ' + body.motivo : ''}${allCancelled ? ' — última orden activa, solicitud cancelada' : ''}`,
      { itemIndex, motivo: body.motivo }
    )
    return NextResponse.json({ ok: true, row: data })
  }

  // ── editar ─────────────────────────────────────────────────────────────────
  if (accion === 'editar') {
    const isOwner = sol.asesor === session.name
    if (!isMesa && !isOwner) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (!['mesa_operaciones', 'pendiente_revision', 'devuelta'].includes(sol.estado))
      return NextResponse.json({ error: 'Solo editable antes de ser tomada por Mesa' }, { status: 400 })
    const allowed = ['tipo_operacion','instrumento_tipo','instrumento_nombre','clase','moneda',
      'monto','cantidad','fecha_operacion','observaciones','symbol','cusip_isin',
      'precio_tipo','precio_limite','vigencia','maturity','cupon','comision']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) if (key in body) updates[key] = body[key]
    const data = await updateSolicitud(params.id, updates)
    await logEvento('editada', `Solicitud editada por ${session.name}`, updates)
    return NextResponse.json({ ok: true, row: data })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
