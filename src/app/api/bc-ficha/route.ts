import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const empresa = url.searchParams.get('empresa')
  const tipo = url.searchParams.get('tipo')

  let query = supabaseAdmin
    .from('bc_fichas')
    .select('id, empresa, tipo_cliente, client_name, perfil_result, perfil_score, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (empresa) query = query.eq('empresa', empresa)
  if (tipo) query = query.eq('tipo_cliente', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa, tipo_cliente, client_id, client_name, ficha_data, perfil_data, lista_data, perfil_score, perfil_result } = body

  const { data, error } = await supabaseAdmin
    .from('bc_fichas')
    .insert({
      empresa,
      tipo_cliente,
      client_id: client_id || null,
      client_name: client_name || null,
      ficha_data: ficha_data ?? {},
      perfil_data: perfil_data ?? {},
      lista_data: lista_data ?? {},
      perfil_score: perfil_score ?? null,
      perfil_result: perfil_result ?? null,
      created_by: session.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
