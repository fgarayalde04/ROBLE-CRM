import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// PATCH /api/instruments/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body    = await req.json()
  const updates: Record<string, any> = {}

  const allowed = ['nombre', 'tipo_activo', 'isin', 'cusip', 'ticker', 'moneda', 'emisor', 'categoria', 'activo']
  for (const key of allowed) {
    if (key in body) {
      updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key]
    }
  }
  // nombre can't be null
  if ('nombre' in updates && !updates.nombre) {
    return NextResponse.json({ error: 'nombre no puede estar vacío' }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('instrument_master')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un instrumento con ese ISIN o CUSIP' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}

// DELETE /api/instruments/[id] — soft delete (activo = false)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('instrument_master')
    .update({ activo: false })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
