import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasPermission } from '@/lib/auth'
import ConsolidadoClient from './ConsolidadoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Posición Consolidada' }

// /plantillas/consolidado → subir los reportes de Pershing y Morgan Stanley y
// armar la posición consolidada (con cupón corrido), renta y movimientos.
export default async function PosicionConsolidadaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'research', session.permissions)) redirect('/')

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 print:hidden">
        <Link href="/plantillas" className="hover:text-gray-600">Plantillas</Link>
        <span>/</span>
        <span className="text-gray-600">Posición Consolidada</span>
      </div>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Posición Consolidada</h1>
        <p className="mt-1 text-sm text-gray-500">
          Subí los reportes de Pershing y Morgan Stanley (posiciones, movimientos y calendario de cupones). Ninguno es obligatorio: con un solo Unrealized ya se arma el reporte.
        </p>
      </div>
      <ConsolidadoClient />
    </div>
  )
}
