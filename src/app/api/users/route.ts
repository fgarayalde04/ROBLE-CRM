import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    throw new Error('Acceso no autorizado')
  }
  return session
}

export async function GET() {
  try {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('crm_users')
      .select('id, name, email, role, active, permissions, created_at, updated_at')
      .order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('autorizado') ? 403 : 400 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const { name, email, password, role } = await req.json()
    if (!name || !password || !role) {
      return NextResponse.json({ error: 'Nombre, contraseña y rol son requeridos' }, { status: 400 })
    }
    const hash = await bcrypt.hash(password, 12)
    const { data, error } = await supabaseAdmin
      .from('crm_users')
      .insert({ name, email: email?.toLowerCase().trim() || null, password_hash: hash, role, active: true })
      .select('id, name, email, role, active, created_at')
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin()
    const { id, password, name, email, role, active, permissions } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined)        update.name = name
    if (email !== undefined)       update.email = email ? email.toLowerCase().trim() : null
    if (role !== undefined)        update.role = role
    if (active !== undefined)      update.active = active
    if (permissions !== undefined) update.permissions = permissions
    if (password)                  update.password_hash = await bcrypt.hash(password, 12)

    const { data, error } = await supabaseAdmin
      .from('crm_users')
      .update(update)
      .eq('id', id)
      .select('id, name, email, role, active, permissions')
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

// PATCH — approve or reject a pending user
export async function PATCH(req: Request) {
  try {
    await requireAdmin()
    const { id, action } = await req.json() as { id: string; action: 'approve' | 'reject' }
    if (!id || !action) return NextResponse.json({ error: 'id y action requeridos' }, { status: 400 })

    if (action === 'approve') {
      // Fetch current permissions to strip _pending_approval
      const { data: u } = await supabaseAdmin
        .from('crm_users')
        .select('permissions')
        .eq('id', id)
        .single()

      const cleaned = (u?.permissions ?? []).filter((p: string) => p !== '_pending_approval')

      const { data, error } = await supabaseAdmin
        .from('crm_users')
        .update({
          active: true,
          permissions: cleaned.length > 0 ? cleaned : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, name, email, role, active, permissions')
        .single()

      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === 'reject') {
      const { error } = await supabaseAdmin.from('crm_users').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true, deleted: id })
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin()
    const { id } = await req.json()
    if (id === session.id) {
      return NextResponse.json({ error: 'No podés eliminarte a vos mismo' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.from('crm_users').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
