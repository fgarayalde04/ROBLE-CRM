import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Contraseña actual y nueva son requeridas' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    // Fetch current hash
    const { data: user, error } = await supabaseAdmin
      .from('crm_users')
      .select('id, password_hash')
      .eq('id', session.id)
      .single()

    if (error || !user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 401 })

    const newHash = await bcrypt.hash(newPassword, 12)
    const { error: updateError } = await supabaseAdmin
      .from('crm_users')
      .update({ password_hash: newHash, must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', session.id)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
