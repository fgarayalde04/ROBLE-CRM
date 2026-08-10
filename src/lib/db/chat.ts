import { pool } from './pool'

export async function getConversationIdsForUser(userId: string) {
  const { rows } = await pool.query(
    `select conversation_id from chat_participants where user_id = $1`,
    [userId]
  )
  return rows.map((r) => r.conversation_id as string)
}

export async function getConversationsWithDetails(convIds: string[]) {
  if (convIds.length === 0) return []

  const { rows: convs } = await pool.query(
    `select id, type, name, updated_at from chat_conversations where id = ANY($1) order by updated_at desc`,
    [convIds]
  )

  const { rows: participants } = await pool.query(
    `select cp.conversation_id, cp.user_id, cp.last_read_at, u.id as u_id, u.name as u_name
     from chat_participants cp
     left join crm_users u on u.id = cp.user_id
     where cp.conversation_id = ANY($1)`,
    [convIds]
  )

  const { rows: messages } = await pool.query(
    `select id, conversation_id, content, sender_name, message_type, task_title, created_at
     from chat_messages where conversation_id = ANY($1)`,
    [convIds]
  )

  return convs.map((conv) => ({
    ...conv,
    participants: participants
      .filter((p) => p.conversation_id === conv.id)
      .map((p) => ({ user_id: p.user_id, last_read_at: p.last_read_at, user: p.u_id ? { id: p.u_id, name: p.u_name } : null })),
    messages: messages.filter((m) => m.conversation_id === conv.id),
  }))
}

export async function findSharedDirectConversation(myConvIds: string[], otherId: string) {
  if (myConvIds.length === 0) return null
  const { rows: shared } = await pool.query(
    `select conversation_id from chat_participants where user_id = $1 and conversation_id = ANY($2)`,
    [otherId, myConvIds]
  )
  if (!shared.length) return null
  const sharedIds = shared.map((r) => r.conversation_id)
  const { rows } = await pool.query(
    `select id from chat_conversations where type = 'direct' and id = ANY($1) limit 1`,
    [sharedIds]
  )
  return rows[0] ?? null
}

export async function createConversation(type: string, name: string | null) {
  const { rows } = await pool.query(
    `insert into chat_conversations (type, name) values ($1, $2) returning id`,
    [type, name]
  )
  return rows[0]
}

export async function addParticipants(conversationId: string, userIds: string[]) {
  if (userIds.length === 0) return
  const values: any[] = []
  const rowsSql = userIds.map((uid, i) => {
    values.push(conversationId, uid)
    return `($${i * 2 + 1}, $${i * 2 + 2})`
  })
  await pool.query(
    `insert into chat_participants (conversation_id, user_id) values ${rowsSql.join(', ')}`,
    values
  )
}

export async function verifyParticipant(conversationId: string, userId: string) {
  const { rows } = await pool.query(
    `select user_id from chat_participants where conversation_id = $1 and user_id = $2`,
    [conversationId, userId]
  )
  return rows.length > 0
}

export async function listMessages(conversationId: string) {
  const { rows } = await pool.query(
    `select id, sender_id, sender_name, content, message_type, task_id, task_title, created_at
     from chat_messages where conversation_id = $1 order by created_at asc limit 100`,
    [conversationId]
  )
  return rows
}

export async function createMessage(input: {
  conversation_id: string
  sender_id: string
  sender_name: string
  content: string
  message_type: string
  task_id: string | null
  task_title: string | null
}) {
  const { rows } = await pool.query(
    `insert into chat_messages (conversation_id, sender_id, sender_name, content, message_type, task_id, task_title)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [input.conversation_id, input.sender_id, input.sender_name, input.content, input.message_type, input.task_id, input.task_title]
  )
  return rows[0]
}

export async function touchConversation(conversationId: string, now: string) {
  await pool.query(`update chat_conversations set updated_at = $1 where id = $2`, [now, conversationId])
}

export async function markParticipantRead(conversationId: string, userId: string, now: string) {
  await pool.query(
    `update chat_participants set last_read_at = $1 where conversation_id = $2 and user_id = $3`,
    [now, conversationId, userId]
  )
}
