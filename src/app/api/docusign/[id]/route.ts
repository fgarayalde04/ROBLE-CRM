import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET    /api/docusign/[id]          — detalle
// PATCH  /api/docusign/[id]          — actualiza campos
// DELETE /api/docusign/[id]          — elimina borrador

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('docusign_envelopes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('docusign_envelopes')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo se pueden borrar borradores
  const { data: env } = await supabaseAdmin
    .from('docusign_envelopes')
    .select('estado')
    .eq('id', params.id)
    .single()

  if (env?.estado !== 'borrador') {
    return NextResponse.json({ error: 'Solo se pueden eliminar borradores' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('docusign_envelopes')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
