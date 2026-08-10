import { NextResponse } from 'next/server'
import { updateMonitoringRecordExplanation, deleteMonitoringRecord } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/records/[id] — update explanation
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { explanation } = await req.json()

  const data = await updateMonitoringRecordExplanation(params.id, explanation ?? null)
  return NextResponse.json(data)
}

// DELETE /api/monitoring/records/[id] — remove record from run
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteMonitoringRecord(params.id)
  return NextResponse.json({ ok: true })
}
