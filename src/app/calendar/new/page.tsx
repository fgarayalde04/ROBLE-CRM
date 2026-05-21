import type { Metadata } from 'next'
import Link from 'next/link'
import DeadlineForm from '@/components/DeadlineForm'

export const metadata: Metadata = { title: 'Nuevo vencimiento' }

export default function NewDeadlinePage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/calendar" className="hover:text-gray-600">Vencimientos</Link>
        <span>/</span>
        <span className="text-gray-600">Nuevo</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo vencimiento</h1>
      <DeadlineForm mode="new" />
    </div>
  )
}
