import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('crm_users')
      .select('id, name, email, role, password_hash, active, permissions, must_change_password')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    }
    if (!user.active) {
      const isPending = Array.isArray(user.permissions) && user.permissions.includes('_pending_approval')
      const msg = isPending
        ? 'Tu cuenta está pendiente de aprobación por el administrador.'
        : 'Cuenta suspendida. Contactá al administrador.'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    }

    const token = await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role },
      must_change_password: user.must_change_password ?? false,
    })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })
    return res
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
