import { NextResponse } from 'next/server'
import { closeMonitoringAccount } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/accounts/close — mark account as inactive by account_number or account_name
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_number, account_name, entity } = await req.json()
  if (!account_number && !account_name) {
    return NextResponse.json({ error: 'account_number o account_name requerido' }, { status: 400 })
  }

  await closeMonitoringAccount(account_number ?? null, account_name ?? null, entity ?? 'roble')

  return NextResponse.json({ ok: true })
}
