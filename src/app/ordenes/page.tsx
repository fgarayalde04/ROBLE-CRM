import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { hasGoogleConnection } from '@/lib/google/tokens'
import OrdenesClient from './OrdenesClient'

export const metadata: Metadata = { title: 'Enviar órdenes | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function OrdenesPage() {
  noStore()
  const session = await getSession()
  if (!session) redirect('/login')

  const gmailConnected = await hasGoogleConnection()

  return <OrdenesClient gmailConnected={gmailConnected} />
}
