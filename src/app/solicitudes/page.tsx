import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasGoogleConnection } from '@/lib/google/tokens'
import SolicitudesClient from './SolicitudesClient'
import { MESA_ROLES } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Solicitudes' }


export default async function SolicitudesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isMesa = MESA_ROLES.includes(session.role)
  const gmailConnected = await hasGoogleConnection()

  return (
    <Suspense>
      <SolicitudesClient
        isMesa={isMesa}
        userName={session.name}
        userEmail={session.email ?? ''}
        gmailConnected={gmailConnected}
      />
    </Suspense>
  )
}
