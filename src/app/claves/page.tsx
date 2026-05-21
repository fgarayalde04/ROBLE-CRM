export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SecretsVault from './SecretsVault'

export default async function ClavesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#2D3F52]">Claves</h1>
        <p className="text-sm text-gray-500 mt-1">Bóveda de accesos del equipo</p>
      </div>
      <SecretsVault />
    </div>
  )
}
