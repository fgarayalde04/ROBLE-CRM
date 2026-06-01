import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vars = [
    'MICROSOFT_TENANT_ID',
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
    'CLIENTES_DRIVE_ID',
    'CLIENTES_FOLDER_ID',
  ]
  const missing = vars.filter(v => !process.env[v])
  const parsedInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '1', 10)

  return NextResponse.json({
    configured: missing.length === 0,
    missingVars: missing,
    intervalMinutes: Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1,
  })
}
