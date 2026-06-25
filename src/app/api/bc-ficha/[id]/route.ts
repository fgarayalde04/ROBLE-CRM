import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('bc_fichas')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { ficha_data, perfil_data, lista_data, perfil_score, perfil_result, client_name, client_id } = body

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (ficha_data !== undefined) update.ficha_data = ficha_data
  if (perfil_data !== undefined) update.perfil_data = perfil_data
  if (lista_data !== undefined) update.lista_data = lista_data
  if (perfil_score !== undefined) update.perfil_score = perfil_score
  if (perfil_result !== undefined) update.perfil_result = perfil_result
  if (client_name !== undefined) update.client_name = client_name
  if (client_id !== undefined) update.client_id = client_id

  const { data, error } = await supabaseAdmin
    .from('bc_fichas')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { error } = await supabaseAdmin.from('bc_fichas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
