import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getUserOneDriveConfig } from '@/lib/db/users'
import MiCarpetaClient from './MiCarpetaClient'

export const metadata: Metadata = { title: 'Mi carpeta | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function MiCarpetaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await getUserOneDriveConfig(session.id)

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
