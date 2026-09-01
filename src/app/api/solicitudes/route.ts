import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateSolicitudId, listSolicitudes, createSolicitud, insertSolicitudEvento } from '@/lib/db/solicitudes'
import { notifyNuevaOrden } from '@/lib/notifications/orderEvents'

const MESA_ROLES  = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']
const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/solicitudes — bandeja
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isMesa  = MESA_ROLES.includes(session.role)
  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { searchParams } = req.nextUrl

  const estado   = searchParams.get('estado')
  const q        = searchParams.get('q')?.trim()
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')
  const asesor   = isAdmin ? searchParams.get('asesor') : null
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)
  const page     = Math.max(parseInt(searchParams.get('page')  ?? '0',   10), 0)

  const { data, total } = await listSolicitudes({
    asesorFilter: !isMesa ? session.name : null,
    asesor, estado, q, dateFrom, dateTo, limit, page,
  })

  return NextResponse.json({ solicitudes: data, isMesa, total, page, limit })
}

// POST /api/solicitudes — crear solicitud
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body    = await req.json()
  const isMesa  = MESA_ROLES.includes(session.role)
  const isDirecto = body.directo === true

  const solicitudId = await generateSolicitudId(body.client_number ?? null)
  const now = new Date().toISOString()

  const hasAssets = Array.isArray(body.assets_json) && body.assets_json.length > 0

  // Extraer monto/cantidad del primer bloque si no vienen como campos top-level
  let resolvedMonto: number | null = body.monto ?? null
  let resolvedCantidad: number | null = body.cantidad ?? null
  if (hasAssets && resolvedMonto == null && resolvedCantidad == null) {
    const firstBlock = body.assets_json[0]
    if (firstBlock?.type === 'fondos') {
      resolvedMonto = firstBlock.monto ? parseFloat(firstBlock.monto) : null
    } else if (firstBlock?.type === 'acciones') {
      if (firstBlock.cantidadTipo === 'monto') {
        resolvedMonto = firstBlock.cantidad ? parseFloat(firstBlock.cantidad) : null
      } else {
        resolvedCantidad = firstBlock.cantidad ? parseFloat(firstBlock.cantidad) : null
      }
    } else if (firstBlock?.type === 'bonos') {
      resolvedCantidad = firstBlock.cantidad ? parseFloat(firstBlock.cantidad) : null
      if (firstBlock.precio !== 'mercado' && firstBlock.precioLimite && resolvedCantidad) {
        resolvedMonto = (parseFloat(firstBlock.precioLimite) / 100) * resolvedCantidad
      }
    }
  }

  const canal = isDirecto
    ? (isMesa ? 'directo_mesa' : 'directo_asesor')
    : hasAssets ? 'orden_completa' : 'via_mesa'

  const estado = isDirecto ? 'mail_enviado'
    : hasAssets ? 'pendiente_revision'
    : 'mesa_operaciones'

  const baseInsert: Record<string, any> = {
    solicitud_id:       solicitudId,
    asesor:             session.name,
    asesor_id:          session.id,
    client_id:          body.client_id          ?? null,
    client_name:        body.client_name         ?? null,
    client_number:      body.client_number       ?? null,
    client_email:       body.client_email        ?? null,
    tipo_operacion:     body.tipo_operacion,
    instrumento_tipo:   body.instrumento_tipo,
    instrumento_nombre: body.instrumento_nombre,
    clase:              body.clase               ?? null,
    moneda:             body.moneda,
    monto:              resolvedMonto,
    cantidad:           resolvedCantidad,
    fecha_operacion:    body.fecha_operacion,
    observaciones:      body.observaciones       ?? null,
    symbol:             body.symbol              ?? null,
    cusip_isin:         body.cusip_isin          ?? null,
    precio_tipo:        body.precio_tipo         ?? null,
    precio_limite:      body.precio_limite       ?? null,
    vigencia:           body.vigencia            ?? 'DIA',
    maturity:           body.maturity            ?? null,
    cupon:              body.cupon               ?? null,
    comision:           body.comision            ?? null,
    assets_json:        hasAssets ? JSON.stringify(body.assets_json) : null,
    mail_preview:       body.mail_preview        ?? null,
    mail_asunto:        body.mail_asunto         ?? null,
    canal,
    estado,
    opera_asesor:       body.opera_asesor === true,
    cc_emails: Array.isArray(body.cc_emails) && body.cc_emails.length > 0 ? body.cc_emails : null,
    additional_emails: Array.isArray(body.additional_emails) && body.additional_emails.length > 0 ? body.additional_emails : null,
    ...(isDirecto ? {
      mail_cuerpo:       body.mail_cuerpo ?? null,
      mail_enviado_at:   now,
      mail_enviado_by:   session.name,
      mail_thread_id:    body.mail_thread_id  ?? null,
      mail_message_id:   body.mail_message_id ?? null,
      notif_mail_enviada: true,
      ...(isMesa ? {
        operador:    session.name,
        operador_id: session.id,
        tomado_at:   now,
        notif_tomada_enviada: true,
      } : {}),
    } : {}),
  }

  let data
  try {
    data = await createSolicitud(baseInsert)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  const descripcion = isDirecto
    ? `Orden creada con envío directo al cliente por ${session.name}`
    : hasAssets
    ? `Orden completa enviada a revisión interna por ${session.name} (${body.assets_json.length} activo${body.assets_json.length !== 1 ? 's' : ''})`
    : `Solicitud creada por ${session.name} — derivada a Mesa de Operaciones`

  await insertSolicitudEvento({
    solicitud_id: data.id,
    tipo:         isDirecto ? 'creada_directo' : hasAssets ? 'creada_revision' : 'creada',
    descripcion,
    usuario:      session.name,
    usuario_id:   session.id,
  })

  // Envío directo al cliente no pasa por la cola de revisión de Mesa — nadie que notificar ahí.
  if (!isDirecto) {
    await notifyNuevaOrden({
      id: data.id, clientName: body.client_name ?? null, asesorName: session.name, asesorId: session.id,
    })
  }

  return NextResponse.json({ ok: true, id: data.id, solicitud_id: data.solicitud_id, canal })
}
