import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MiCarpetaClient from './MiCarpetaClient'

export const metadata: Metadata = { title: 'Mi carpeta | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function MiCarpetaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <MiCarpetaClient userId={session.id} userName={session.name} />
}
