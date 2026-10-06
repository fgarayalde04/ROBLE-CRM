import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { getSession } from '@/lib/auth'
import { listDescartes } from '@/lib/db/descartes'
import EliminadosClient from './EliminadosClient'

export const metadata: Metadata = { title: 'Clientes eliminados' }
export const dynamic = 'force-dynamic'

const ROLES = ['admin', 'ceo', 'direccion', 'asistente']

export default async function EliminadosPage() {
  noStore()
  const session = await getSession()
  if (!session || !ROLES.includes(session.role)) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">No tenés permiso para ver esta sección.</div>
  }
  const rows = await listDescartes()

  return (
    <div className="p-4 md:p-8">
      <Link href="/clients" className="text-xs text-gray-400 hover:text-gray-600">← Clientes</Link>
      <h1 className="text-2xl font-semibold text-[#2D3F52] mt-1">Clientes eliminados</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Clientes borrados a propósito. La sincronización no los vuelve a crear aunque su carpeta o su legajo de Banco
        Central sigan existiendo. Al restaurar uno, vuelve a aparecer en Clientes (pestaña Pendientes) en uno o dos minutos.
      </p>
      <EliminadosClient rows={rows.map(r => ({ ...r, created_at: new Date(r.created_at).toISOString() }))} />
    </div>
  )
}
