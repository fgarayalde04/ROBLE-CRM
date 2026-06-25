import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET  /api/docusign  — lista envelopes con filtros
// POST /api/docusign  — crea envelope (borrador o envía)

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresa  = searchParams.get('empresa')
  const estado   = searchParams.get('estado')
  const clientId = searchParams.get('client_id')

  let q = supabaseAdmin
    .from('docusign_envelopes')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (empresa)  q = q.eq('empresa', empresa)
  if (estado)   q = q.eq('estado', estado)
  if (clientId) q = q.eq('client_id', clientId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    client_id, client_name, empresa, tipo_cliente,
    documentos, firmantes, mensaje, fecha_limite,
    responsable_name, carpeta_destino, origen_tipo, origen_id,
    enviar_ahora = false,
  } = body

  // Insertar como borrador primero
  const { data, error } = await supabaseAdmin
    .from('docusign_envelopes')
    .insert({
      client_id, client_name, empresa, tipo_cliente,
      documentos: documentos ?? [],
      firmantes:  firmantes  ?? [],
      mensaje:    mensaje    ?? '',
      fecha_limite: fecha_limite ? new Date(fecha_limite).toISOString() : null,
      responsable_id:   session.id,
      responsable_name: responsable_name ?? session.name,
      carpeta_destino:  carpeta_destino  ?? '',
      origen_tipo, origen_id,
      estado:     enviar_ahora ? 'pendiente_envio' : 'borrador',
      created_by: session.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
