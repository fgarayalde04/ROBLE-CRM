import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasPermission, isAdminRole } from '@/lib/auth'
import { getConsolidado, listConsolidados, type ConsolidadoRow } from '@/lib/db/consolidados'
import ConsolidadoClient from './ConsolidadoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Posición Consolidada' }

// /factsheet/consolidado        → subir los reportes de Pershing y Morgan Stanley y armar el consolidado
// /factsheet/consolidado?id=xxx → reabrir uno guardado
export default async function PosicionConsolidadaPage({ searchParams }: { searchParams: { id?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'factsheet', session.permissions)) redirect('/')

  // Dirección ve todos; cada asesor, los que guardó.
  const creadoPor = isAdminRole(session.role) ? undefined : session.name
  let historial: ConsolidadoRow[] = []
  let guardado: Awaited<ReturnType<typeof getConsolidado>> = null
  try {
    ;[historial, guardado] = await Promise.all([
      listConsolidados({ creadoPor }),
      searchParams.id ? getConsolidado(searchParams.id) : Promise.resolve(null),
    ])
    if (guardado && creadoPor && guardado.created_by !== creadoPor) guardado = null
  } catch (err) {
    console.error('[consolidado] list', err)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 print:hidden">
        <Link href="/factsheet" className="hover:text-gray-600">Portafolio</Link>
        <span>/</span>
        <span className="text-gray-600">Posición Consolidada</span>
      </div>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-semibold text-gray-900">Posición Consolidada</h1>
        <p className="mt-1 text-sm text-gray-500">
          Subí los reportes de una cuenta en Pershing y Morgan Stanley (posiciones, movimientos y calendario de cupones). Ninguno es obligatorio: con un solo Unrealized ya se arma el reporte.
        </p>
      </div>
      <ConsolidadoClient
        guardado={guardado ? { id: guardado.id, cliente: guardado.client_name, datos: guardado.datos } : null}
        historial={historial}
      />
    </div>
  )
}
