import { NextResponse } from 'next/server'
import { verifyParticipant, listMessages, createMessage, touchConversation, markParticipantRead } from '@/lib/db/chat'
import { getSession } from '@/lib/auth'

// GET /api/chat/messages?conversationId=xxx
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })

  if (!(await verifyParticipant(conversationId, session.id))) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const data = await listMessages(conversationId)
  return NextResponse.json(data ?? [])
}

// POST /api/chat/messages — send a message
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, content, messageType, taskId, taskTitle } = await req.json()
  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!(await verifyParticipant(conversationId, session.id))) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const now = new Date().toISOString()

  let msg
  try {
    msg = await createMessage({
      conversation_id: conversationId,
      sender_id: session.id,
      sender_name: session.name,
      content: content.trim(),
      message_type: messageType ?? 'text',
      task_id: taskId ?? null,
      task_title: taskTitle ?? null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Update conversation timestamp + mark sender as read
  await Promise.all([
    touchConversation(conversationId, now),
    markParticipantRead(conversationId, session.id, now),
  ])

  return NextResponse.json(msg)
}

// PUT /api/chat/messages — mark conversation as read
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json()
  await markParticipantRead(conversationId, session.id, new Date().toISOString())

  return NextResponse.json({ ok: true })
}
