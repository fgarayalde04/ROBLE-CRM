import type { Metadata } from 'next'
import Link from 'next/link'
import OpeningForm from '@/components/OpeningForm'
import { getClients } from '@/lib/supabase/queries'
import type { Client } from '@/types/platform'

export const metadata: Metadata = { title: 'Nueva apertura' }
export const dynamic = 'force-dynamic'

export default async function NewOpeningPage() {
  let clients: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'>[] = []
  try {
    const all = await getClients()
    clients = all.map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, client_number: c.client_number }))
  } catch {}

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/openings" className="hover:text-gray-600">Apertura de cuentas</Link>
        <span>/</span>
        <span className="text-gray-600">Nueva apertura</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nueva apertura de cuenta</h1>
      <OpeningForm mode="new" clients={clients} />
    </div>
  )
}
