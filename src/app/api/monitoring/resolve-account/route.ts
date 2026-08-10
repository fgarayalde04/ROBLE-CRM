import { NextResponse } from 'next/server'
import { resolveMonitoringAccount } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/resolve-account
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_number } = await req.json()
  if (!account_number) return NextResponse.json({ error: 'account_number requerido' }, { status: 400 })

  const runsUpdated = await resolveMonitoringAccount(account_number)

  return NextResponse.json({ ok: true, runs_updated: runsUpdated })
}
