import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getConversationMeta, verifyParticipant, addParticipants, removeParticipant } from '@/lib/db/chat'

// POST /api/chat/[id]/participants — add participants to a group
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await verifyParticipant(params.id, session.id))) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const conv = await getConversationMeta(params.id)
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conv.type !== 'group') {
    return NextResponse.json({ error: 'Solo se pueden agregar participantes a una conversación grupal' }, { status: 400 })
  }

  const { userIds } = await req.json()
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'userIds required' }, { status: 400 })
  }

  await addParticipants(params.id, userIds)
  return NextResponse.json({ ok: true })
}

// DELETE /api/chat/[id]/participants — leave a group (self only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (userId !== session.id) {
    return NextResponse.json({ error: 'Solo podés salir vos mismo del grupo' }, { status: 403 })
  }

  if (!(await verifyParticipant(params.id, session.id))) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  await removeParticipant(params.id, session.id)
  return NextResponse.json({ ok: true })
}
