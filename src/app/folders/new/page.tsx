import type { Metadata } from 'next'
import Link from 'next/link'
import NewFolderForm from '@/components/NewFolderForm'

export const metadata: Metadata = { title: 'Nueva carpeta' }

export default function NewFolderPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/folders" className="hover:text-gray-600">Nuevas carpetas</Link>
        <span>/</span>
        <span className="text-gray-600">Agregar carpeta</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Agregar nueva carpeta</h1>
      <NewFolderForm />
    </div>
  )
}
