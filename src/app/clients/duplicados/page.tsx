import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { findDuplicateGroups } from '@/lib/db/clientMerge'
import DuplicatesClient from './DuplicatesClient'

export const metadata: Metadata = { title: 'Clientes duplicados' }
export const dynamic = 'force-dynamic'

const ROLES = ['admin', 'ceo', 'direccion', 'asistente']

export default async function DuplicadosPage() {
  noStore()
  const session = await getSession()
  if (!session || !ROLES.includes(session.role)) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">No tenés permiso para ver esta sección.</div>
  }
  const groups = await findDuplicateGroups()

  return (
    <div className="p-4 md:p-8">
      <Link href="/clients" className="text-xs text-gray-400 hover:text-gray-600">← Clientes</Link>
      <h1 className="text-2xl font-semibold text-[#2D3F52] mt-1">Clientes duplicados</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Clientes con el mismo nombre. Al fusionar, todo lo del duplicado (aperturas, legajo de Banco Central, tareas,
        propuestas) pasa al cliente que conservás, y el duplicado se elimina.
      </p>
      <DuplicatesClient initialGroups={groups} />
    </div>
  )
}
