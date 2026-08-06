import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import CuadernoClient from './CuadernoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cuaderno | Roble Capital' }

export default async function CuadernoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <CuadernoClient />
}
