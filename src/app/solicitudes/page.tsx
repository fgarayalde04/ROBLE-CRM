import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasGoogleConnection } from '@/lib/google/tokens'
import SolicitudesClient from './SolicitudesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Solicitudes | Roble Capital' }

const MESA_ROLES = ['admin', 'ceo', 'direccion', 'mesa']

export default async function SolicitudesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isMesa = MESA_ROLES.includes(session.role)
  const gmailConnected = await hasGoogleConnection()

  return (
    <SolicitudesClient
      isMesa={isMesa}
      userName={session.name}
      userEmail={session.email ?? ''}
      gmailConnected={gmailConnected}
    />
  )
}
