import type { Metadata } from 'next'
import Link from 'next/link'
import DocumentForm from '@/components/DocumentForm'

export const metadata: Metadata = { title: 'Nuevo documento' }

export default function NewDocumentPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/documents" className="hover:text-gray-600">Documentos</Link>
        <span>/</span>
        <span className="text-gray-600">Nuevo</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo documento</h1>
      <DocumentForm mode="new" />
    </div>
  )
}
