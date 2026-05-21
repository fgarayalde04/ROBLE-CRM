import type { Metadata } from 'next'
import SearchInterface from '@/components/SearchInterface'

export const metadata: Metadata = { title: 'Buscador' }

export default function SearchPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Buscador global</h1>
        <p className="mt-1 text-sm text-gray-500">
          Buscar clientes, documentos, tareas y vencimientos
        </p>
      </div>
      <SearchInterface />
    </div>
  )
}
