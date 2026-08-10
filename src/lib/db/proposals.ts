import { pool } from './pool'

export async function listProposals(status: string | null, scope: { advisorId?: string } | null) {
  const where: string[] = []
  const params: any[] = []
  if (status) { params.push(status); where.push(`status = $${params.length}`) }
  if (scope?.advisorId) {
    params.push(scope.advisorId)
    where.push(`(advisor_id = $${params.length} or shared_with_all = true)`)
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from investment_proposals ${whereClause} order by created_at desc`,
    params
  )
  return rows
}

export async function createProposal(input: Record<string, any>) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into investment_proposals (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function getProposalAllocationsForIds(ids: string[]) {
  if (ids.length === 0) return { funds: [], bonds: [], equities: [] }
  const [{ rows: funds }, { rows: bonds }, { rows: equities }] = await Promise.all([
    pool.query(`select proposal_id, pct, ytm_indicative from proposal_funds where proposal_id = ANY($1)`, [ids]),
    pool.query(`select proposal_id, pct, yield from proposal_bonds where proposal_id = ANY($1)`, [ids]),
    pool.query(`select proposal_id, pct from proposal_equities where proposal_id = ANY($1)`, [ids]),
  ])
  return { funds, bonds, equities }
}

export async function getProposalWithLines(id: string) {
  const [{ rows: pRows }, { rows: funds }, { rows: bonds }, { rows: equities }] = await Promise.all([
    pool.query(`select * from investment_proposals where id = $1`, [id]),
    pool.query(`select * from proposal_funds where proposal_id = $1 order by position`, [id]),
    pool.query(`select * from proposal_bonds where proposal_id = $1 order by position`, [id]),
    pool.query(`select * from proposal_equities where proposal_id = $1 order by position`, [id]),
  ])
  return { proposal: pRows[0] ?? null, funds, bonds, equities }
}

export async function updateProposal(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update investment_proposals set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteProposal(id: string) {
  await pool.query(`delete from investment_proposals where id = $1`, [id])
}

// ─── generic line-item helpers (proposal_funds / proposal_bonds / proposal_equities) ──

export async function nextPosition(table: string, proposalId: string) {
  const { rows } = await pool.query(`select count(*) from ${table} where proposal_id = $1`, [proposalId])
  return parseInt(rows[0].count, 10)
}

export async function insertProposalLine(table: string, row: Record<string, any>) {
  const entries = Object.entries(row).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into ${table} (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updateProposalLine(table: string, id: string, proposalId: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id, proposalId)
  const { rows } = await pool.query(
    `update ${table} set ${setClause.join(', ')} where id = $${values.length - 1} and proposal_id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteProposalLine(table: string, id: string | null, proposalId: string) {
  if (!id) return
  await pool.query(`delete from ${table} where id = $1 and proposal_id = $2`, [id, proposalId])
}
