export const dynamic = 'force-dynamic'

import { resourcesTableExists, listResources } from '@/lib/db/resources'
import ResourcesClient from '@/components/ResourcesClient'
import SetupNeeded from './SetupNeeded'

export default async function RecursosPage() {
  const tableExists = await resourcesTableExists()

  if (!tableExists) {
    return <SetupNeeded />
  }

  const resources = await listResources().catch(() => [])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Recursos</h1>
        <p className="mt-1 text-sm text-gray-500">Centro de materiales de trabajo</p>
      </div>
      <ResourcesClient initialResources={resources} />
    </div>
  )
}
