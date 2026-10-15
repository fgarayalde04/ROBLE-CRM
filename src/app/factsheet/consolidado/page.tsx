import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasPermission, isAdminRole } from '@/lib/auth'
import { getConsolidado } from '@/lib/db/consolidados'
import ConsolidadoClient from './ConsolidadoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nuevo reporte' }

// /factsheet/consolidado        → "Nuevo reporte": subir los reportes de una o
//                                 varias cuentas de Pershing y Morgan Stanley
// /factsheet/consolidado?id=xxx → reabrir un portafolio armado
export default async function PosicionConsolidadaPage({ searchParams }: { searchParams: { id?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'factsheet', session.permissions)) redirect('/')

  // Dirección ve todos; cada asesor, los que armó.
  const creadoPor = isAdminRole(session.role) ? undefined : session.name
  let guardado: Awaited<ReturnType<typeof getConsolidado>> = null
  try {
    guardado = searchParams.id ? await getConsolidado(searchParams.id) : null
    if (guardado && creadoPor && guardado.created_by !== creadoPor) guardado = null
  } catch (err) {
    console.error('[consolidado] get', err)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 print:hidden">
        <Link href="/factsheet" className="hover:text-gray-600">Portafolio</Link>
        <span>/</span>
        <span className="text-gray-600">{guardado ? guardado.client_name : 'Nuevo reporte'}</span>
      </div>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-semibold text-gray-900">{guardado ? guardado.client_name : 'Nuevo reporte'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Subí los reportes de cada cuenta del cliente en Pershing y Morgan Stanley (posiciones, calendario de cupones y Activity). Alcanza con el Unrealized o el Holdings; lo demás es opcional. Si tiene varias cuentas, agregalas abajo.
        </p>
      </div>
      <ConsolidadoClient
        guardado={guardado ? { id: guardado.id, cliente: guardado.client_name, datos: guardado.datos } : null}
      />
    </div>
  )
}
