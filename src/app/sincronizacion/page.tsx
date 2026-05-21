import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SyncPanel from './SyncPanel'

export const metadata = { title: 'Sincronizacion | CRM' }

export default async function SincronizacionPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: '#2D3F52' }}>
          Sincronizacion
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Microsoft SharePoint · OneDrive corporativo
        </p>
      </div>
      <SyncPanel />
    </div>
  )
}
