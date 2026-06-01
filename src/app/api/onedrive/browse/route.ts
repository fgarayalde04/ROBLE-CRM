import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, listFolderChildren, getDriveItem } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

async function getUserOneDriveConfig(userId: string, role: string) {
  const { data } = await supabaseAdmin
    .from('crm_users')
    .select('onedrive_drive_id, onedrive_folder_id, onedrive_folder_path')
    .eq('id', userId)
    .single()
  return data
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const requestedFolderId = searchParams.get('folderId')
    const requestedDriveId  = searchParams.get('driveId')

    // Get user's OneDrive config
    const cfg = await getUserOneDriveConfig(session.id, session.role)

    // Admins can browse using any driveId/folderId
    const isAdmin = session.role === 'admin'

    let driveId: string
    let folderId: string

    if (isAdmin && requestedDriveId && requestedFolderId) {
      driveId  = requestedDriveId
      folderId = requestedFolderId
    } else if (isAdmin && requestedDriveId && !requestedFolderId) {
      // Admin browsing root of a drive
      driveId  = requestedDriveId
      folderId = 'root'
    } else {
      // Regular user: must have assigned folder
      if (!cfg?.onedrive_drive_id || !cfg?.onedrive_folder_id) {
        return NextResponse.json({ error: 'no_folder_assigned', items: [] })
      }
      driveId  = cfg.onedrive_drive_id
      folderId = requestedFolderId ?? cfg.onedrive_folder_id
    }

    const token = await getGraphToken()

    // Fetch folder metadata (for breadcrumb) + children in parallel
    const [folder, items] = await Promise.all([
      getDriveItem(driveId, folderId, token),
      listFolderChildren(driveId, folderId, token),
    ])

    return NextResponse.json({
      folder,
      items,
      rootFolderId: cfg?.onedrive_folder_id ?? null,
    })
  } catch (err: any) {
    console.error('[onedrive/browse]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
