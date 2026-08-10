import { NextResponse } from 'next/server'
import { deleteMonitoringRun } from '@/lib/db/monitoring'
import { getSession } from '@/lib/auth'

// DELETE /api/monitoring/[id] — admin only
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins pueden eliminar monitoreos' }, { status: 403 })

  await deleteMonitoringRun(params.id)
  return NextResponse.json({ ok: true })
}
