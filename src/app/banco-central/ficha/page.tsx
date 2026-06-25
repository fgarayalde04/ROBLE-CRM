import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import FichaModule from './FichaModule'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ficha BCU | Roble Capital' }

export default async function FichaPage({ searchParams }: { searchParams: { id?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return <FichaModule fichaId={searchParams.id ?? null} />
}
