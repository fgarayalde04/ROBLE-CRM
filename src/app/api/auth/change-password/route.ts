import { NextResponse } from 'next/server'
import { getUserPasswordHash, updateUserPassword } from '@/lib/db/users'
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

    const user = await getUserPasswordHash(session.id)
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 401 })

    const newHash = await bcrypt.hash(newPassword, 12)
    await updateUserPassword(session.id, newHash)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
