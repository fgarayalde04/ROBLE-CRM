import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

function computeEstado(item: {
  mail_respondido: boolean
  done: boolean
  en_mercado_at: string | null
  cancelado_at: string | null
  vigencia: string | null
  order_date: string | null
}): string {
  if (item.cancelado_at)  return 'cancelada'
  if (item.done)          return 'ejecutada'
  if (item.en_mercado_at) return 'en_mercado'
  if (item.mail_respondido) return 'autorizada'
  // check vencida: vigencia=DIA and order_date is in the past
  if (item.vigencia === 'DIA' && item.order_date) {
    const today = new Date().toISOString().split('T')[0]
    if (item.order_date < today) return 'vencida'
  }
  return 'pendiente_autorizacion'
}

// PATCH /api/ordenes/blotter/[id]
// accion: 'mail_respondido' | 'en_mercado' | 'ejecutar' | 'cancelar' | 'editar'
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const body    = await req.json()
  const { accion } = body

  // Fetch the item
  const { data: item } = await supabaseAdmin
    .from('order_history_items')
    .select('id, order_id, mail_respondido, done, en_mercado_at, cancelado_at, vigencia, order_date, estado')
    .eq('id', params.id)
    .single()

  if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Get parent to check ownership
  const { data: parent } = await supabaseAdmin
    .from('order_history')
    .select('id, user_name, orden_id, client_name')
    .eq('id', item.order_id)
    .single()

  if (!parent) return NextResponse.json({ error: 'Orden padre no encontrada' }, { status: 404 })

  const isOwner = parent.user_name === session.name

  // ── Acciones ──────────────────────────────────────────────────────

  if (accion === 'mail_respondido') {
    if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const val = body.value === true
    const nuevoEstado = computeEstado({
      ...item,
      mail_respondido: val,
      cancelado_at: item.cancelado_at,
    })

    const { data, error } = await supabaseAdmin
      .from('order_history_items')
      .update({
        mail_respondido:    val,
        mail_respondido_at: val ? new Date().toISOString() : null,
        mail_respondido_by: val ? session.name             : null,
        estado:             nuevoEstado,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('order_eventos').insert({
      item_id:     params.id,
      order_id:    item.order_id,
      tipo:        val ? 'mail_respondido' : 'mail_respondido_revertido',
      descripcion: val
        ? `Mail respondido registrado por ${session.name}`
        : `Mail respondido removido por ${session.name}`,
      usuario:    session.name,
      usuario_id: session.id,
    })

    return NextResponse.json({ ok: true, row: data })
  }

  if (accion === 'en_mercado') {
    if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (!item.mail_respondido) return NextResponse.json({ error: 'Requiere mail respondido' }, { status: 400 })

    const nuevoEstado = 'en_mercado'

    const { data, error } = await supabaseAdmin
      .from('order_history_items')
      .update({
        en_mercado_at: new Date().toISOString(),
        en_mercado_by: session.name,
        estado:        nuevoEstado,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('order_eventos').insert({
      item_id:     params.id,
      order_id:    item.order_id,
      tipo:        'en_mercado',
      descripcion: `Orden enviada al mercado por ${session.name}`,
      usuario:    session.name,
      usuario_id: session.id,
    })

    return NextResponse.json({ ok: true, row: data })
  }

  if (accion === 'ejecutar') {
    if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    if (!item.mail_respondido) return NextResponse.json({ error: 'Requiere autorización del cliente' }, { status: 400 })

    const precioEjecutado = body.precio_ejecutado != null ? Number(body.precio_ejecutado) : null
    const valorEfectivo   = body.valor_efectivo   != null ? Number(body.valor_efectivo)   : null

    const { data, error } = await supabaseAdmin
      .from('order_history_items')
      .update({
        done:             true,
        precio_ejecutado: precioEjecutado,
        valor_efectivo:   valorEfectivo,
        ejecutado_at:     new Date().toISOString(),
        ejecutado_by:     session.name,
        estado:           'ejecutada',
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('order_eventos').insert({
      item_id:     params.id,
      order_id:    item.order_id,
      tipo:        'ejecutada',
      descripcion: `Orden ejecutada por ${session.name}${precioEjecutado ? ` a precio ${precioEjecutado}` : ''}`,
      usuario:    session.name,
      usuario_id: session.id,
      datos:      { precio_ejecutado: precioEjecutado, valor_efectivo: valorEfectivo },
    })

    return NextResponse.json({ ok: true, row: data })
  }

  if (accion === 'cancelar') {
    if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('order_history_items')
      .update({
        cancelado_at:     new Date().toISOString(),
        cancelado_by:     session.name,
        cancelado_motivo: body.motivo ?? null,
        estado:           'cancelada',
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('order_eventos').insert({
      item_id:     params.id,
      order_id:    item.order_id,
      tipo:        'cancelada',
      descripcion: `Orden cancelada por ${session.name}${body.motivo ? `: ${body.motivo}` : ''}`,
      usuario:    session.name,
      usuario_id: session.id,
      datos:      { motivo: body.motivo },
    })

    return NextResponse.json({ ok: true, row: data })
  }

  if (accion === 'editar_precios') {
    if (!isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const updates: Record<string, any> = {}
    if (body.precio_ejecutado !== undefined) updates.precio_ejecutado = body.precio_ejecutado ? Number(body.precio_ejecutado) : null
    if (body.valor_efectivo   !== undefined) updates.valor_efectivo   = body.valor_efectivo   ? Number(body.valor_efectivo)   : null
    if (body.notes            !== undefined) updates.notes            = body.notes ?? null

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('order_history_items')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('order_eventos').insert({
      item_id:     params.id,
      order_id:    item.order_id,
      tipo:        'editado',
      descripcion: `Orden editada por ${session.name}`,
      usuario:    session.name,
      usuario_id: session.id,
      datos:      updates,
    })

    return NextResponse.json({ ok: true, row: data })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}

// GET /api/ordenes/blotter/[id] — historial de eventos del item
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('order_eventos')
    .select('id, tipo, descripcion, usuario, datos, created_at')
    .eq('item_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ eventos: data ?? [] })
}
