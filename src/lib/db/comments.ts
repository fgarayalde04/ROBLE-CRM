import { pool } from './pool'

export async function listComments(entityType: string, entityId: string) {
  const { rows } = await pool.query(
    `select * from comments where entity_type = $1 and entity_id = $2 order by created_at asc`,
    [entityType, entityId]
  )
  return rows
}

export async function createComment(input: { entity_type: string; entity_id: string | null; author: string; content: string }) {
  const { rows } = await pool.query(
    `insert into comments (entity_type, entity_id, author, content) values ($1, $2, $3, $4) returning *`,
    [input.entity_type, input.entity_id, input.author, input.content]
  )
  return rows[0]
}

export async function deleteComment(id: string) {
  await pool.query(`delete from comments where id = $1`, [id])
}
