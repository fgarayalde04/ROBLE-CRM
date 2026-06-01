import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import MiCarpetaClient from './MiCarpetaClient'

export const metadata: Metadata = { title: 'Mi carpeta | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function MiCarpetaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const { data: user } = await supabaseAdmin
    .from('crm_users')
    .select('onedrive_drive_id, onedrive_folder_id, onedrive_folder_path')
    .eq('id', session.id)
    .single()

  return (
    <MiCarpetaClient
      userId={session.id}
      userName={session.name}
      driveId={user?.onedrive_drive_id ?? null}
      rootFolderId={user?.onedrive_folder_id ?? null}
      rootFolderPath={user?.onedrive_folder_path ?? null}
    />
  )
}
