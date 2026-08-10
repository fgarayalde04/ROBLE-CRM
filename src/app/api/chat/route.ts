import { NextResponse } from 'next/server'
import {
  getConversationIdsForUser, getConversationsWithDetails,
  findSharedDirectConversation, createConversation, addParticipants,
} from '@/lib/db/chat'
import { getSession } from '@/lib/auth'

// GET /api/chat — list conversations for current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const convIds = await getConversationIdsForUser(session.id)
  if (!convIds.length) return NextResponse.json([])

  const convs = await getConversationsWithDetails(convIds)

  const result = convs.map((conv: any) => {
    const myParticipation = (conv.participants ?? []).find((p: any) => p.user_id === session.id)
    const lastReadAt = myParticipation?.last_read_at

    const msgs = [...(conv.messages ?? [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastMsg = msgs[0]

    const unreadCount = lastReadAt
      ? msgs.filter((m: any) => new Date(m.created_at) > new Date(lastReadAt)).length
      : msgs.length

    const otherParticipants = (conv.participants ?? [])
      .filter((p: any) => p.user_id !== session.id)
      .map((p: any) => ({ id: p.user?.id, name: p.user?.name }))
      .filter((p: any) => p.id)

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      updated_at: conv.updated_at,
      other_participants: otherParticipants,
      last_message: lastMsg
        ? lastMsg.message_type === 'task_ref'
          ? `📎 ${lastMsg.task_title}`
          : lastMsg.content
        : null,
      last_message_sender: lastMsg?.sender_name ?? null,
      last_message_at: lastMsg?.created_at ?? null,
      unread_count: unreadCount,
    }
  })

  return NextResponse.json(result)
}

// POST /api/chat — create or find direct conversation
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, name, participantIds } = await req.json()
  if (!participantIds?.length) return NextResponse.json({ error: 'participantIds required' }, { status: 400 })

  // For direct messages between 2 users: find existing conversation
  if (type === 'direct' && participantIds.length === 1) {
    const otherId = participantIds[0]
    const myConvIds = await getConversationIdsForUser(session.id)
    const existing = await findSharedDirectConversation(myConvIds, otherId)
    if (existing) return NextResponse.json({ id: existing.id, existing: true })
  }

  // Create new conversation
  let conv
  try {
    conv = await createConversation(type ?? 'direct', name ?? null)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const allIds = [session.id, ...participantIds.filter((id: string) => id !== session.id)]
  await addParticipants(conv.id, allIds)

  return NextResponse.json({ id: conv.id, existing: false })
}
