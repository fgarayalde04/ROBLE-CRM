import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { listUsers, createUser, updateUser, getUserPermissions, approveUser, deleteUser } from '@/lib/db/users'

// Mismas claves que el tipo Permission del cliente (UsersManager.tsx) — se
// valida acá también porque en algún momento la columna terminó con
// duplicados y una clave inválida ("fondos") acumulados; esto evita que
// vuelva a pasar sin importar qué mande el cliente.
const VALID_PERMISSIONS = new Set([
  'panel','tasks','clients','openings','banco_central','calendar','deadlines',
  'ceo_dashboard','kpis','pagos','impuestos','liquidacion','recursos','claves',
  'admin','sincronizacion','factsheet','proposals','orders','research',
])

function sanitizePermissions(permissions: unknown): string[] | null {
  if (!Array.isArray(permissions)) return null
  return Array.from(new Set(permissions.filter((p) => VALID_PERMISSIONS.has(p))))
}

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
    const data = await listUsers()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('autorizado') ? 403 : 400 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const { name, email, password, role, must_change_password, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path } = await req.json()
    if (!name || !password || !role) {
      return NextResponse.json({ error: 'Nombre, contraseña y rol son requeridos' }, { status: 400 })
    }
    const hash = await bcrypt.hash(password, 12)
    const data = await createUser({
      name,
      email: email?.toLowerCase().trim() || null,
      passwordHash: hash,
      role,
      mustChangePassword: must_change_password ?? true,
      onedriveDriveId: onedrive_drive_id,
      onedriveFolderId: onedrive_folder_id,
      onedriveFolderPath: onedrive_folder_path,
    })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin()
    const { id, password, name, email, role, active, permissions, modo_asesor, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (name !== undefined)        update.name = name
    if (email !== undefined)       update.email = email ? email.toLowerCase().trim() : null
    if (role !== undefined)        update.role = role
    if (active !== undefined)      update.active = active
    if (permissions !== undefined) update.permissions = permissions === null ? null : sanitizePermissions(permissions)
    if (modo_asesor !== undefined) update.modo_asesor = modo_asesor
    if (password)                  update.password_hash = await bcrypt.hash(password, 12)
    if (onedrive_drive_id   !== undefined) update.onedrive_drive_id   = onedrive_drive_id   || null
    if (onedrive_folder_id  !== undefined) update.onedrive_folder_id  = onedrive_folder_id  || null
    if (onedrive_folder_path !== undefined) update.onedrive_folder_path = onedrive_folder_path || null

    const data = await updateUser(id, update)
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
      const permissions = await getUserPermissions(id)
      const cleaned = (permissions ?? []).filter((p: string) => p !== '_pending_approval')
      const data = await approveUser(id, cleaned)
      return NextResponse.json(data)
    }

    if (action === 'reject') {
      await deleteUser(id)
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
    await deleteUser(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
