import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { deleteClientEmail } from '@/lib/db/clients'

// DELETE /api/clients/[id]/emails/[emailId]
export async function DELETE(_req: Request, { params }: { params: { id: string; emailId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  await deleteClientEmail(params.emailId, params.id)
  return NextResponse.json({ ok: true })
}
