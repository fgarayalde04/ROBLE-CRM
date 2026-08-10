import { NextResponse } from 'next/server'
import { getMonitoringRunRecords } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// GET /api/monitoring/[id]/records
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filtered = await getMonitoringRunRecords(params.id)
  return NextResponse.json(filtered)
}
