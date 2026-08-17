import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getConversationMeta, renameConversation, verifyParticipant } from '@/lib/db/chat'

// PATCH /api/chat/[id] — rename a group conversation
export async function PATCH(
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
    return NextResponse.json({ error: 'Solo se puede renombrar una conversación grupal' }, { status: 400 })
  }

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const updated = await renameConversation(params.id, name.trim())
  return NextResponse.json(updated)
}
