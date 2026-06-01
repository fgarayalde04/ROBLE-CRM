import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import MiCarpetaClient from '@/app/mi-carpeta/MiCarpetaClient'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: {
    driveId?: string
    folderId?: string
    name?: string
  }
}

export default async function OneDriveFolderPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) notFound()

  if (!searchParams.driveId || !searchParams.folderId) notFound()

  return (
    <MiCarpetaClient
      userId={session.id}
      userName={session.name}
      driveId={searchParams.driveId}
      rootFolderId={searchParams.folderId}
      rootFolderPath={searchParams.name ?? 'Carpeta OneDrive'}
    />
  )
}
