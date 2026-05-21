import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// GET /api/users/folder-permissions?userId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const [userRes, permRes] = await Promise.all([
    supabaseAdmin.from('crm_users').select('see_all_folders').eq('id', userId).single(),
    supabaseAdmin.from('user_client_folder_permissions')
      .select('folder_name, can_view')
      .eq('user_id', userId),
  ])

  return NextResponse.json({
    see_all_folders: userRes.data?.see_all_folders ?? false,
    folders: (permRes.data ?? []).filter((f: any) => f.can_view).map((f: any) => f.folder_name),
  })
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

  // Update see_all_folders flag
  await supabaseAdmin
    .from('crm_users')
    .update({ see_all_folders: !!see_all_folders, updated_at: new Date().toISOString() })
    .eq('id', userId)

  // Replace all folder permissions
  await supabaseAdmin.from('user_client_folder_permissions').delete().eq('user_id', userId)

  if (!see_all_folders && Array.isArray(folders) && folders.length > 0) {
    await supabaseAdmin.from('user_client_folder_permissions').insert(
      folders.map((folder_name: string) => ({
        user_id: userId,
        folder_name,
        can_view: true,
        updated_at: new Date().toISOString(),
      }))
    )
  }

  return NextResponse.json({ ok: true })
}
