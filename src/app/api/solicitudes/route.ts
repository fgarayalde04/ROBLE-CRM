import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const MESA_ROLES  = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']
const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

async function generateSolicitudId(clientNumber: string | null): Promise<string> {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const prefix  = clientNumber ? `${clientNumber}${dateStr}` : dateStr

  const today = new Date().toISOString().split('T')[0]
  let query = supabaseAdmin
    .from('solicitudes')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today + 'T00:00:00.000Z')
    .lte('created_at', today + 'T23:59:59.999Z')

  if (clientNumber) query = query.eq('client_number', clientNumber)

  const { count } = await query
  return `${prefix}.${String((count ?? 0) + 1).padStart(3, '0')}`
}

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

  let query = supabaseAdmin
    .from('solicitudes')
    .select(`
      id, solicitud_id, asesor, estado, canal, tipo_operacion,
      instrumento_tipo, instrumento_nombre, clase, moneda, monto, cantidad,
      fecha_operacion, client_name, client_number, client_email,
      operador, tomado_at, mail_enviado_at, ejecutado_at,
      created_at, updated_at, cc_emails
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (!isMesa) query = query.eq('asesor', session.name)
  if (asesor)  query = query.eq('asesor', asesor)
  if (estado)  query = query.eq('estado', estado)
  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00.000Z')
  if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
  if (q) query = query.or(
    `client_name.ilike.%${q}%,client_number.ilike.%${q}%,instrumento_nombre.ilike.%${q}%,solicitud_id.ilike.%${q}%`
  )

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ solicitudes: data ?? [], isMesa, total: count ?? 0, page, limit })
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
  const canal = isDirecto
    ? (isMesa ? 'directo_mesa' : 'directo_asesor')
    : hasAssets ? 'orden_completa' : 'via_mesa'

  // New flow: orders with assets_json go to pendiente_revision
  const estado = isDirecto ? 'mail_enviado'
    : hasAssets ? 'pendiente_revision'
    : 'mesa_operaciones'

  const { data, error } = await supabaseAdmin
    .from('solicitudes')
    .insert({
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
      monto:              body.monto               ?? null,
      cantidad:           body.cantidad            ?? null,
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
      assets_json:        hasAssets ? body.assets_json : null,
      mail_preview:       body.mail_preview        ?? null,
      mail_asunto:        body.mail_asunto         ?? null,
      cc_emails:          Array.isArray(body.cc_emails) && body.cc_emails.length > 0 ? body.cc_emails : null,
      canal,
      estado,
      ...(isDirecto ? {
        mail_cuerpo:       body.mail_cuerpo ?? null,
        mail_enviado_at:   now,
        mail_enviado_by:   session.name,
        notif_mail_enviada: true,
        ...(isMesa ? {
          operador:    session.name,
          operador_id: session.id,
          tomado_at:   now,
          notif_tomada_enviada: true,
        } : {}),
      } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const descripcion = isDirecto
    ? `Orden creada con envío directo al cliente por ${session.name}`
    : hasAssets
    ? `Orden completa enviada a revisión interna por ${session.name} (${body.assets_json.length} activo${body.assets_json.length !== 1 ? 's' : ''})`
    : `Solicitud creada por ${session.name} — derivada a Mesa de Operaciones`

  await supabaseAdmin.from('solicitud_eventos').insert({
    solicitud_id: data.id,
    tipo:         isDirecto ? 'creada_directo' : hasAssets ? 'creada_revision' : 'creada',
    descripcion,
    usuario:      session.name,
    usuario_id:   session.id,
  })

  return NextResponse.json({ ok: true, id: data.id, solicitud_id: data.solicitud_id, canal })
}
