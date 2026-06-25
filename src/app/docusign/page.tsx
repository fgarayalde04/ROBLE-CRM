import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DocuSignDashboard from './DocuSignDashboard'

export const dynamic = 'force-dynamic'

export default async function DocuSignPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <DocuSignDashboard user={session} />
}
