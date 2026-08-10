import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listSyncLogs } from '@/lib/db/sync'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await listSyncLogs(50)
    return NextResponse.json(data ?? [])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
