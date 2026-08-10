import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listSyncLogs } from '@/lib/db/sync'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch last 50 logs then deduplicate per sync_type in JS
  let rows
  try {
    rows = await listSyncLogs(50)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const latest: typeof rows = []

  for (const row of rows) {
    if (!seen.has(row.sync_type)) {
      seen.add(row.sync_type)
      latest.push(row)
    }
  }

  return NextResponse.json(latest)
}
