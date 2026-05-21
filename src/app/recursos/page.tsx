export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase/admin'
import ResourcesClient from '@/components/ResourcesClient'
import SetupNeeded from './SetupNeeded'

async function checkTableExists(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from('resources').select('id').limit(1)
    if (error && error.message.toLowerCase().includes('does not exist')) {
      return false
    }
    return true
  } catch {
    return false
  }
}

async function getResources() {
  const { data, error } = await supabaseAdmin
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return []
  return data ?? []
}

export default async function RecursosPage() {
  const tableExists = await checkTableExists()

  if (!tableExists) {
    return <SetupNeeded />
  }

  const resources = await getResources()

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
