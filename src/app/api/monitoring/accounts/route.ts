import { NextResponse } from 'next/server'
import { listMonitoringBaseAccounts, upsertMonitoringBaseAccounts } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// GET /api/monitoring/accounts?entity=roble
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') ?? 'roble'

  const data = await listMonitoringBaseAccounts(entity)
  return NextResponse.json(data)
}

// POST /api/monitoring/accounts — bulk upsert
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const entity: string = body.entity ?? 'roble'
  const accounts: any[] = (body.accounts ?? []).map((a: any) => ({ ...a, entity }))
  if (!accounts.length) return NextResponse.json({ error: 'Sin cuentas' }, { status: 400 })

  try {
    await upsertMonitoringBaseAccounts(accounts)
    return NextResponse.json({ ok: true, count: accounts.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
