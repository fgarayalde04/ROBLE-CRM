import { redirect } from 'next/navigation'
import { getSession, hasPermission } from '@/lib/auth'
import MasOperadoClient from './MasOperadoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lo más operado' }

export default async function MasOperadoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <MasOperadoClient puedeCrearPlantilla={hasPermission(session.role, 'research', session.permissions)} />
}
