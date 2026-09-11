import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listFundsWithReturns } from '@/lib/db/fundMonitor'
import FondosMonitorClient from './FondosMonitorClient'

export const metadata = { title: 'Monitor de Fondos' }
export const dynamic = 'force-dynamic'

export default async function FondosMonitorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  noStore()
  const funds = await listFundsWithReturns()

  return <FondosMonitorClient funds={funds} />
}
