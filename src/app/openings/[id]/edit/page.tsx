import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOpening, getClients } from '@/lib/supabase/queries'
import OpeningForm from '@/components/OpeningForm'
import type { Client } from '@/types/platform'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const o = await getOpening(params.id)
    return { title: `Editar — ${o.folder_name}` }
  } catch {
    return { title: 'Editar apertura' }
  }
}

export default async function EditOpeningPage({ params }: { params: { id: string } }) {
  let opening, clients: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'>[] = []
  try {
    opening = await getOpening(params.id)
    const all = await getClients()
    clients = all.map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, client_number: c.client_number }))
  } catch {
    notFound()
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/openings" className="hover:text-gray-600">Apertura de cuentas</Link>
        <span>/</span>
        <Link href={`/openings/${opening.id}`} className="hover:text-gray-600">{opening.folder_name}</Link>
        <span>/</span>
        <span className="text-gray-600">Editar</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Editar apertura</h1>
      <OpeningForm mode="edit" initial={opening} clients={clients} />
    </div>
  )
}
