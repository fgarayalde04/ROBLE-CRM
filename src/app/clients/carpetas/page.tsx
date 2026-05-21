import type { Metadata } from 'next'
import Link from 'next/link'
import CarpetasView from '@/components/CarpetasView'

export const metadata: Metadata = { title: 'Carpetas de clientes' }
export const dynamic = 'force-dynamic'

export default function CarpetasPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Carpetas de clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista del sistema de archivos — carpetas agrupadas por asesor
          </p>
        </div>
        <Link
          href="/clients"
          className="text-sm text-gray-500 hover:text-[#2D3F52] hover:underline"
        >
          ← Volver a clientes
        </Link>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          href="/clients"
          className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 -mb-px transition-colors"
        >
          Lista CRM
        </Link>
        <span className="px-4 py-2 text-sm font-medium border-b-2 border-[#2D3F52] text-[#2D3F52] -mb-px">
          Carpetas
        </span>
      </div>

      <CarpetasView />
    </div>
  )
}
