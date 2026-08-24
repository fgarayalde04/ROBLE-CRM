import { NextResponse } from 'next/server'
import { updateMonitoringBaseAccount, deleteMonitoringBaseAccount } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/accounts/[id] — update editable fields
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowed = ['risk_level', 'risk_tolerance', 'activity_profile', 'comments', 'is_active', 'needs_review', 'account_name', 'client_code', 'custodian']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const data = await updateMonitoringBaseAccount(params.id, update)
  return NextResponse.json(data)
}

// DELETE /api/monitoring/accounts/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins pueden eliminar cuentas' }, { status: 403 })

  await deleteMonitoringBaseAccount(params.id)
  return NextResponse.json({ ok: true })
}
