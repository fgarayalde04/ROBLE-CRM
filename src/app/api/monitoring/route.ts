import { NextResponse } from 'next/server'
import { listMonitoringRuns } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// GET /api/monitoring?entity=roble|geliene
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') ?? 'roble'

  const data = await listMonitoringRuns(entity)
  return NextResponse.json(data)
}
