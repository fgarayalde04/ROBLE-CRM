import { pool } from './pool'

export type ResearchType =
  | 'morning_brief' | 'noticia_mercado' | 'bono' | 'fondo' | 'nueva_emision'
  | 'research' | 'macro' | 'regulacion' | 'novedad_interna'

export interface MorningBriefSection {
  text: string
  sources: { title: string; source: string; url: string }[]
}

// Claves dinámicas — antes eran fijas (mercados/estados_unidos/...), pero el
// mensaje real de Zapia trae sus propios títulos por día, así que la sección
// se guarda tal cual viene, sin forzarla a categorías predefinidas.
export type MorningBriefSections = Record<string, MorningBriefSection>

interface ListFilters {
  type?: ResearchType
  types?: ResearchType[]
  category?: string
  q?: string
  archived?: boolean
  featured?: boolean
  from?: string  // ISO date, inclusive — filters published_at
  to?: string    // ISO date, inclusive
  userId?: string // to compute `read` per post
  limit?: number
}

function shapeReadJoin(row: any) {
  const { is_read, ...rest } = row
  return { ...rest, read: !!is_read }
}

export async function listPosts(filters: ListFilters = {}) {
  const where: string[] = ['archived = $1']
  const params: any[] = [filters.archived ?? false]

  if (filters.type) { params.push(filters.type); where.push(`type = $${params.length}`) }
  if (filters.types && filters.types.length > 0) { params.push(filters.types); where.push(`type = ANY($${params.length})`) }
  if (filters.category) { params.push(filters.category); where.push(`category = $${params.length}`) }
  if (filters.featured) where.push(`featured = true`)
  if (filters.from) { params.push(filters.from); where.push(`published_at >= $${params.length}`) }
  if (filters.to) { params.push(filters.to); where.push(`published_at <= $${params.length}`) }
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(title ilike $${params.length} or summary ilike $${params.length} or body ilike $${params.length})`)
  }

  params.push(filters.userId ?? null)
  const userIdParamIdx = params.length

  params.push(filters.limit ?? 100)

  const { rows } = await pool.query(
    `select p.*,
            exists(select 1 from research_reads r where r.post_id = p.id and r.user_id = $${userIdParamIdx}) as is_read
     from research_posts p
     where ${where.join(' and ')}
     order by pinned desc, published_at desc
     limit $${params.length}`,
    params
  )
  return rows.map(shapeReadJoin)
}

export async function getPost(id: string, userId?: string) {
  const { rows } = await pool.query(
    `select p.*,
            exists(select 1 from research_reads r where r.post_id = p.id and r.user_id = $2) as is_read
     from research_posts p where p.id = $1`,
    [id, userId ?? null]
  )
  return rows[0] ? shapeReadJoin(rows[0]) : null
}

export async function listMorningBriefs(filters: { from?: string; to?: string; q?: string; limit?: number } = {}) {
  const where: string[] = [`type = 'morning_brief'`, `archived = false`]
  const params: any[] = []
  if (filters.from) { params.push(filters.from); where.push(`brief_date >= $${params.length}`) }
  if (filters.to) { params.push(filters.to); where.push(`brief_date <= $${params.length}`) }
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(title ilike $${params.length} or array_to_string(headlines, ' ') ilike $${params.length} or sections::text ilike $${params.length})`)
  }
  params.push(filters.limit ?? 60)
  const { rows } = await pool.query(
    `select * from research_posts where ${where.join(' and ')} order by brief_date desc limit $${params.length}`,
    params
  )
  return rows
}

export async function getLatestMorningBrief() {
  const { rows } = await pool.query(
    `select * from research_posts where type = 'morning_brief' and archived = false
     order by brief_date desc limit 1`
  )
  return rows[0] ?? null
}

export async function createPost(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const { rows } = await pool.query(
    `insert into research_posts (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updatePost(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() })
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update research_posts set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function markRead(postId: string, userId: string) {
  await pool.query(
    `insert into research_reads (post_id, user_id) values ($1, $2) on conflict do nothing`,
    [postId, userId]
  )
}

export async function getUnreadCount(userId: string) {
  const { rows } = await pool.query(
    `select count(*) from research_posts p
     where p.archived = false
       and not exists (select 1 from research_reads r where r.post_id = p.id and r.user_id = $1)`,
    [userId]
  )
  return parseInt(rows[0].count, 10)
}
