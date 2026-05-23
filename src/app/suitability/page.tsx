import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SuitabilityClient from './SuitabilityClient'

export default async function SuitabilityPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <SuitabilityClient />
}
