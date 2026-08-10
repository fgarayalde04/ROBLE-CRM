import { NextRequest, NextResponse } from 'next/server'
import { getFolderPermissionsView, setFolderPermissions } from '@/lib/db/users'
import { getSession } from '@/lib/auth'

// GET /api/users/folder-permissions?userId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const data = await getFolderPermissionsView(userId)
  return NextResponse.json(data)
}

// PUT /api/users/folder-permissions
// Body: { userId, see_all_folders, folders: string[] }
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { userId, see_all_folders, folders } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  await setFolderPermissions(userId, !!see_all_folders, Array.isArray(folders) ? folders : [])

  return NextResponse.json({ ok: true })
}
