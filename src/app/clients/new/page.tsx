import type { Metadata } from 'next'
import Link from 'next/link'
import ClientForm from '@/components/ClientForm'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default function NewClientPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/clients" className="hover:text-gray-600">Clientes</Link>
        <span>/</span>
        <span className="text-gray-600">Nuevo cliente</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo cliente</h1>
      <ClientForm mode="new" />
    </div>
  )
}
