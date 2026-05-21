import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

async function verifyParticipant(conversationId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('chat_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .single()
  return !!data
}

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

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, sender_id, sender_name, content, message_type, task_id, task_title, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
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

  const { data: msg, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: session.id,
      sender_name: session.name,
      content: content.trim(),
      message_type: messageType ?? 'text',
      task_id: taskId ?? null,
      task_title: taskTitle ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Update conversation timestamp + mark sender as read
  await Promise.all([
    supabaseAdmin
      .from('chat_conversations')
      .update({ updated_at: now })
      .eq('id', conversationId),
    supabaseAdmin
      .from('chat_participants')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('user_id', session.id),
  ])

  return NextResponse.json(msg)
}

// PUT /api/chat/messages — mark conversation as read
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json()
  await supabaseAdmin
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', session.id)

  return NextResponse.json({ ok: true })
}
