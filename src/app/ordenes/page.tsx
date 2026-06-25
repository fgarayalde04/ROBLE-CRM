import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { hasGoogleConnection } from '@/lib/google/tokens'
import OrdenesClient from './OrdenesClient'

export const metadata: Metadata = { title: 'Enviar órdenes | Roble Capital' }
export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

interface Props {
  searchParams: { tab?: string }
}

export default async function OrdenesPage({ searchParams }: Props) {
  noStore()
  const session = await getSession()
  if (!session) redirect('/login')

  const gmailConnected = await hasGoogleConnection()
  const isAdmin = ADMIN_ROLES.includes(session.role)

  const VALID_TABS = ['blotter', 'mesa', 'mis-ordenes', 'nueva', 'instrumentos'] as const
  type ValidTab = typeof VALID_TABS[number]
  const rawTab = searchParams.tab as string | undefined
  const initialTab: ValidTab | undefined = VALID_TABS.includes(rawTab as ValidTab)
    ? (rawTab as ValidTab)
    : undefined

  return (
    <OrdenesClient
      gmailConnected={gmailConnected}
      initialTab={initialTab}
      isAdmin={isAdmin}
      userName={session.name}
      userEmail={session.email ?? ''}
    />
  )
}
