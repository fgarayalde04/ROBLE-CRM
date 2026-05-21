import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClient } from '@/lib/supabase/queries'
import ClientForm from '@/components/ClientForm'

export const dynamic = 'force-dynamic'
interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const c = await getClient(params.id)
    return { title: `Editar ${c.first_name} ${c.last_name}` }
  } catch {
    return { title: 'Editar cliente' }
  }
}

export default async function EditClientPage({ params }: Props) {
  let client
  try { client = await getClient(params.id) } catch { notFound() }

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/clients" className="hover:text-gray-600">Clientes</Link>
        <span>/</span>
        <Link href={`/clients/${client.id}`} className="hover:text-gray-600">
          {client.first_name} {client.last_name}
        </Link>
        <span>/</span>
        <span className="text-gray-600">Editar</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Editar cliente</h1>
      <ClientForm mode="edit" initial={client} />
    </div>
  )
}
