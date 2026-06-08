import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import OrdenesClient from './OrdenesClient'

export const metadata: Metadata = { title: 'Enviar órdenes | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function OrdenesPage() {
  noStore()
  const session = await getSession()
  if (!session) redirect('/login')

  // Check if Gmail is connected for this user
  const { data: userData } = await supabaseAdmin
    .from('crm_users')
    .select('google_access_token')
    .eq('id', session.id)
    .maybeSingle()

  const gmailConnected = !!(userData?.google_access_token)

  return <OrdenesClient gmailConnected={gmailConnected} />
}
