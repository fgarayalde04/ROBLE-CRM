import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// GET /api/chat — list conversations for current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: participations } = await supabaseAdmin
    .from('chat_participants')
    .select('conversation_id')
    .eq('user_id', session.id)

  if (!participations?.length) return NextResponse.json([])
  const convIds = participations.map((p: any) => p.conversation_id)

  const { data: convs } = await supabaseAdmin
    .from('chat_conversations')
    .select(`
      id, type, name, updated_at,
      participants:chat_participants(user_id, last_read_at, user:crm_users(id, name)),
      messages:chat_messages(id, content, sender_name, message_type, task_title, created_at)
    `)
    .in('id', convIds)
    .order('updated_at', { ascending: false })

  const result = (convs ?? []).map((conv: any) => {
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

    const { data: myConvs } = await supabaseAdmin
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', session.id)

    const myConvIds = (myConvs ?? []).map((c: any) => c.conversation_id)

    if (myConvIds.length > 0) {
      const { data: sharedConvs } = await supabaseAdmin
        .from('chat_participants')
        .select('conversation_id')
        .eq('user_id', otherId)
        .in('conversation_id', myConvIds)

      if (sharedConvs?.length) {
        const sharedIds = sharedConvs.map((c: any) => c.conversation_id)
        const { data: existing } = await supabaseAdmin
          .from('chat_conversations')
          .select('id')
          .eq('type', 'direct')
          .in('id', sharedIds)
          .limit(1)
          .single()

        if (existing) return NextResponse.json({ id: existing.id, existing: true })
      }
    }
  }

  // Create new conversation
  const { data: conv, error } = await supabaseAdmin
    .from('chat_conversations')
    .insert({ type: type ?? 'direct', name: name ?? null })
    .select('id')
    .single()

  if (error || !conv) return NextResponse.json({ error: error?.message }, { status: 400 })

  const allIds = [session.id, ...participantIds.filter((id: string) => id !== session.id)]
  await supabaseAdmin
    .from('chat_participants')
    .insert(allIds.map((uid: string) => ({ conversation_id: conv.id, user_id: uid })))

  return NextResponse.json({ id: conv.id, existing: false })
}
