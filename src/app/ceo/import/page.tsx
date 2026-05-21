import type { Metadata } from 'next'
import Link from 'next/link'
import ImportWizard from '@/components/ImportWizard'

export const metadata: Metadata = { title: 'Importar datos' }

export default function ImportPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/ceo" className="hover:text-gray-600">Dashboard CEO</Link>
        <span>/</span>
        <span className="text-gray-600">Importar datos</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Importar datos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Carga archivos Excel o CSV con datos financieros para actualizar el dashboard ejecutivo.
        </p>
      </div>
      <ImportWizard />
    </div>
  )
}
