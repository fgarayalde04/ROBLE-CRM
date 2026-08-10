import { pool } from './pool'

function extractAccountFromFile(fileName: string): string | null {
  const m = fileName.match(/_([A-Z0-9]{6,12})(?:\.[^.]+)?$/i)
  return m ? m[1].toUpperCase() : null
}

export async function listPortfolioReviews(clientId: string | null, advisor: string | null, limit: number) {
  const where: string[] = []
  const params: any[] = []
  if (clientId) { params.push(clientId); where.push(`pr.client_id = $${params.length}`) }
  if (advisor) { params.push(`%${advisor}%`); where.push(`pr.advisor ilike $${params.length}`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  params.push(limit)

  const { rows } = await pool.query(
    `select pr.id, pr.client_id, pr.client_name, pr.client_profile,
            pr.uploaded_by, pr.file_name, pr.advisor,
            pr.portfolio_score, pr.portfolio_profile, pr.classified_weight, pr.pending_weight,
            pr.explanation, pr.notes, pr.created_at,
            u.name as uploaded_by_name
     from portfolio_reviews pr
     left join crm_users u on u.id = pr.uploaded_by
     ${whereClause}
     order by pr.created_at desc limit $${params.length}`,
    params
  )

  const reviews = rows.map((r) => {
    const { uploaded_by_name, ...rest } = r
    return { ...rest, crm_users: uploaded_by_name ? { name: uploaded_by_name } : null }
  })

  const clientIds = reviews.map((r) => r.client_id).filter(Boolean) as string[]
  let clientNumberMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    const { rows: clients } = await pool.query(
      `select id, client_number from clients where id = ANY($1)`,
      [clientIds]
    )
    for (const c of clients) {
      if (c.client_number) clientNumberMap[c.id] = c.client_number
    }
  }

  return reviews.map((r) => ({
    ...r,
    client_number: r.client_id
      ? (clientNumberMap[r.client_id] ?? extractAccountFromFile(r.file_name ?? ''))
      : extractAccountFromFile(r.file_name ?? ''),
  }))
}

export async function deletePortfolioReview(id: string) {
  await pool.query(`delete from portfolio_positions where review_id = $1`, [id])
  await pool.query(`delete from portfolio_reviews where id = $1`, [id])
}

export async function updatePortfolioPosition(id: string, update: Record<string, any>) {
  const entries = Object.entries({ ...update, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update portfolio_positions set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function listScoringFiles(q: string, clientId: string) {
  const where: string[] = []
  const params: any[] = []
  if (clientId) { params.push(clientId); where.push(`client_id = $${params.length}`) }
  else if (q) { params.push(`%${q}%`); where.push(`(name ilike $${params.length} or client_folder ilike $${params.length})`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''

  const { rows } = await pool.query(
    `select id, name, client_folder, client_id, drive_id, item_id, web_url, file_size, mime_type, last_modified, last_synced_at
     from scoring_files ${whereClause} order by last_modified desc nulls last limit 200`,
    params
  )
  return rows
}

export async function getReviewWithPositions(uploadId: string) {
  const { rows: reviewRows } = await pool.query(
    `select pr.*, u.name as uploaded_by_name
     from portfolio_reviews pr left join crm_users u on u.id = pr.uploaded_by
     where pr.id = $1`,
    [uploadId]
  )
  if (reviewRows.length === 0) return { review: null, positions: [] }
  const { uploaded_by_name, ...rest } = reviewRows[0]
  const review = { ...rest, crm_users: uploaded_by_name ? { name: uploaded_by_name } : null }

  const { rows: positions } = await pool.query(
    `select * from portfolio_positions where review_id = $1 order by weight desc nulls last`,
    [uploadId]
  )
  return { review, positions }
}

export async function getReviewClientProfile(uploadId: string) {
  const { rows } = await pool.query(`select client_profile from portfolio_reviews where id = $1`, [uploadId])
  return rows[0]?.client_profile ?? null
}

export async function getPositionsForScoring(uploadId: string) {
  const { rows } = await pool.query(
    `select raw_name, market_value, weight, risk_score, asset_class, classification_status
     from portfolio_positions where review_id = $1`,
    [uploadId]
  )
  return rows
}

// ─── Scoring periods ────────────────────────────────────────────────────────

export async function listScoringPeriods() {
  const { rows } = await pool.query(
    `select * from scoring_periods order by period_year desc, period_quarter desc`
  )
  return rows
}

export async function createScoringPeriod(periodYear: number, periodQuarter: number, notes: string | null, createdBy: string) {
  const { rows } = await pool.query(
    `insert into scoring_periods (period_year, period_quarter, notes, created_by) values ($1, $2, $3, $4) returning *`,
    [periodYear, periodQuarter, notes, createdBy]
  )
  return rows[0]
}

export async function getScoringPeriodWithReviews(id: string) {
  const { rows: periodRows } = await pool.query(`select * from scoring_periods where id = $1`, [id])
  const period = periodRows[0] ?? null

  const { rows } = await pool.query(
    `select pr.id, pr.client_id, pr.client_name, pr.client_profile, pr.advisor,
            pr.portfolio_score, pr.portfolio_profile, pr.classified_weight, pr.pending_weight,
            pr.explanation, pr.file_name, pr.notes, pr.created_at,
            u.name as uploaded_by_name
     from portfolio_reviews pr
     left join crm_users u on u.id = pr.uploaded_by
     where pr.period_id = $1
     order by pr.client_name asc nulls last`,
    [id]
  )
  const reviews = rows.map((r) => {
    const { uploaded_by_name, ...rest } = r
    return { ...rest, crm_users: uploaded_by_name ? { name: uploaded_by_name } : null }
  })

  const clientIds = reviews.map((r) => r.client_id).filter(Boolean) as string[]
  let clientNumberMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    const { rows: clients } = await pool.query(`select id, client_number from clients where id = ANY($1)`, [clientIds])
    for (const c of clients) if (c.client_number) clientNumberMap[c.id] = c.client_number
  }

  const enrichedReviews = reviews.map((r) => ({
    ...r,
    client_number: r.client_id
      ? (clientNumberMap[r.client_id] ?? extractAccountFromFile(r.file_name ?? ''))
      : extractAccountFromFile(r.file_name ?? ''),
  }))

  return { period, reviews: enrichedReviews }
}

export async function updateScoringPeriod(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update scoring_periods set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteScoringPeriod(id: string) {
  await pool.query(`update portfolio_reviews set period_id = null where period_id = $1`, [id])
  await pool.query(`delete from scoring_periods where id = $1`, [id])
}

// ─── asset_master ───────────────────────────────────────────────────────────

export async function searchAssetMaster(filters: {
  q?: string; assetClass?: string; scoreMin?: number; scoreMax?: number; needsReview?: boolean
}) {
  const where: string[] = []
  const params: any[] = []
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(identifier ilike $${params.length} or name ilike $${params.length} or ticker ilike $${params.length} or category ilike $${params.length})`)
  }
  if (filters.assetClass) { params.push(filters.assetClass); where.push(`asset_class = $${params.length}`) }
  if (filters.scoreMin !== undefined && !isNaN(filters.scoreMin) && filters.scoreMin > 0) {
    params.push(filters.scoreMin); where.push(`risk_score >= $${params.length}`)
  }
  if (filters.scoreMax !== undefined && !isNaN(filters.scoreMax) && filters.scoreMax < 10) {
    params.push(filters.scoreMax); where.push(`risk_score <= $${params.length}`)
  }
  if (filters.needsReview) where.push(`needs_review = true`)
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''

  const { rows } = await pool.query(
    `select id, identifier, identifier_type, name, ticker, figi, asset_class, risk_score, category, explanation, source, needs_review, created_at, updated_at
     from asset_master ${whereClause} order by updated_at desc limit 500`,
    params
  )
  return rows
}

export async function upsertAssetMaster(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const updateSet = cols.filter((c) => c !== 'identifier').map((c) => `"${c}" = excluded."${c}"`)
  const { rows } = await pool.query(
    `insert into asset_master (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')})
     on conflict (identifier) do update set ${updateSet.join(', ')}
     returning *`,
    values
  )
  return rows[0]
}

export async function updateAssetMaster(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update asset_master set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteAssetMaster(id: string) {
  await pool.query(`delete from asset_master where id = $1`, [id])
}

// ─── scoring_base ───────────────────────────────────────────────────────────

export async function searchScoringBase(filters: {
  q?: string; status?: string; assetClass?: string; needsReview?: boolean; manualOverride?: boolean
  scoreMin?: number; scoreMax?: number
}) {
  const where: string[] = []
  const params: any[] = []
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(security_identifier ilike $${params.length} or normalized_name ilike $${params.length} or symbol ilike $${params.length} or security_description ilike $${params.length} or cusip ilike $${params.length} or isin ilike $${params.length})`)
  }
  if (filters.status) { params.push(filters.status); where.push(`classification_status = $${params.length}`) }
  if (filters.assetClass) { params.push(filters.assetClass); where.push(`asset_class = $${params.length}`) }
  if (filters.needsReview) where.push(`needs_review = true`)
  if (filters.manualOverride) where.push(`manual_override = true`)
  if (filters.scoreMin !== undefined && !isNaN(filters.scoreMin) && filters.scoreMin > 0) {
    params.push(filters.scoreMin); where.push(`risk_score >= $${params.length}`)
  }
  if (filters.scoreMax !== undefined && !isNaN(filters.scoreMax) && filters.scoreMax < 10) {
    params.push(filters.scoreMax); where.push(`risk_score <= $${params.length}`)
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''

  const { rows } = await pool.query(
    `select * from scoring_base ${whereClause} order by times_seen desc nulls last, updated_at desc limit 500`,
    params
  )
  return rows
}

export async function upsertScoringBase(record: Record<string, any>) {
  const cols = Object.keys(record)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const values = cols.map((c) => record[c])
  const updateSet = cols.filter((c) => c !== 'security_identifier').map((c) => `"${c}" = excluded."${c}"`)
  const { rows } = await pool.query(
    `insert into scoring_base (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders.join(', ')})
     on conflict (security_identifier) do update set ${updateSet.join(', ')}
     returning *`,
    values
  )
  return rows[0]
}

export async function updateScoringBase(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update scoring_base set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function deleteScoringBase(id: string) {
  await pool.query(`delete from scoring_base where id = $1`, [id])
}

export async function createPortfolioReview(input: Record<string, any>) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into portfolio_reviews (${cols.join(', ')}) values (${placeholders.join(', ')}) returning id`,
    values
  )
  return rows[0]
}

export async function getAssetMasterCache(identifiers: string[]) {
  if (identifiers.length === 0) return []
  const { rows } = await pool.query(
    `select identifier, asset_class, risk_score, category, figi from asset_master where identifier = ANY($1)`,
    [identifiers]
  )
  return rows
}

export async function insertPortfolioPositionsBatch(positions: Record<string, any>[]) {
  if (positions.length === 0) return []
  const cols = Object.keys(positions[0])
  const values: any[] = []
  const rowsSql = positions.map((rec, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(rec[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  const { rows } = await pool.query(
    `insert into portfolio_positions (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')} returning *`,
    values
  )
  return rows
}

export async function updateReviewScore(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update portfolio_reviews set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

// ─── analyze-from-onedrive helpers ─────────────────────────────────────────

export async function getClientByNumber(num: string) {
  const { rows } = await pool.query(
    `select id, first_name, last_name from clients where client_number = $1`,
    [num]
  )
  return rows[0] ?? null
}

export async function searchClientsByTokens(tokens: string[]) {
  if (tokens.length === 0) return []
  const patterns = tokens.map((t) => `%${t}%`)
  const { rows } = await pool.query(
    `select id, first_name, last_name from clients
     where last_name ilike any($1) or first_name ilike any($1)
     limit 15`,
    [patterns]
  )
  return rows
}

export async function getScoringFilesByIds(ids: string[]) {
  const { rows } = await pool.query(
    `select id, name, drive_id, item_id, client_folder, client_id
     from scoring_files where id = ANY($1)`,
    [ids]
  )
  return rows
}

export async function updateScoringFileClientId(id: string, clientId: string) {
  await pool.query(`update scoring_files set client_id = $1 where id = $2`, [clientId, id])
}

export async function getScoringBaseCache(identifiers: string[]) {
  if (identifiers.length === 0) return []
  const { rows } = await pool.query(
    `select security_identifier, asset_class, risk_score, category, figi, source, classification_status,
            score_explanation, normalized_name, security_type, market_sector, manual_override
     from scoring_base where security_identifier = ANY($1)`,
    [identifiers]
  )
  return rows
}

export async function upsertScoringBaseAsset(p: {
  p_security_identifier: string
  p_identifier_type: string
  p_figi: string | null
  p_normalized_name: string | null
  p_symbol: string | null
  p_security_description: string | null
  p_security_type: string | null
  p_market_sector: string | null
  p_asset_class: string | null
  p_risk_score: number | null
  p_category: string | null
  p_score_explanation: string | null
  p_source: string | null
  p_classification_status: string | null
  p_client_name: string | null
  p_review_id: string | null
}) {
  await pool.query(
    `insert into scoring_base (
       security_identifier, identifier_type, figi,
       normalized_name, symbol, security_description,
       security_type, market_sector,
       asset_class, risk_score, category,
       score_explanation, source, classification_status,
       times_seen, first_seen_at, last_seen_at,
       last_client_seen, last_portfolio_upload,
       last_verified_at, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       1, now(), now(), $15, $16, now(), now(), now()
     )
     on conflict (security_identifier) do update set
       figi                  = coalesce(scoring_base.figi,                 excluded.figi),
       normalized_name       = coalesce(scoring_base.normalized_name,      excluded.normalized_name),
       symbol                = coalesce(scoring_base.symbol,               excluded.symbol),
       security_description  = coalesce(scoring_base.security_description, excluded.security_description),
       security_type         = coalesce(scoring_base.security_type,        excluded.security_type),
       market_sector         = coalesce(scoring_base.market_sector,        excluded.market_sector),
       asset_class            = case when scoring_base.manual_override then scoring_base.asset_class            else excluded.asset_class            end,
       risk_score              = case when scoring_base.manual_override then scoring_base.risk_score              else excluded.risk_score              end,
       category                = case when scoring_base.manual_override then scoring_base.category                else excluded.category                end,
       score_explanation       = case when scoring_base.manual_override then scoring_base.score_explanation       else excluded.score_explanation       end,
       source                  = case when scoring_base.manual_override then scoring_base.source                  else excluded.source                  end,
       classification_status   = case when scoring_base.manual_override then scoring_base.classification_status   else excluded.classification_status   end,
       times_seen             = coalesce(scoring_base.times_seen, 0) + 1,
       last_seen_at           = now(),
       last_client_seen       = coalesce(excluded.last_client_seen,      scoring_base.last_client_seen),
       last_portfolio_upload  = coalesce(excluded.last_portfolio_upload, scoring_base.last_portfolio_upload),
       last_verified_at       = now(),
       updated_at             = now()`,
    [
      p.p_security_identifier, p.p_identifier_type, p.p_figi,
      p.p_normalized_name, p.p_symbol, p.p_security_description,
      p.p_security_type, p.p_market_sector,
      p.p_asset_class, p.p_risk_score, p.p_category,
      p.p_score_explanation, p.p_source, p.p_classification_status,
      p.p_client_name, p.p_review_id,
    ]
  )
}

export async function updateScoringBaseSeen(identifiers: string[], clientName: string | null, reviewId: string | null) {
  if (identifiers.length === 0) return
  await pool.query(
    `update scoring_base
     set times_seen            = coalesce(times_seen, 0) + 1,
         last_seen_at          = now(),
         last_client_seen      = coalesce($2, last_client_seen),
         last_portfolio_upload = coalesce($3, last_portfolio_upload),
         updated_at            = now()
     where security_identifier = ANY($1)`,
    [identifiers, clientName, reviewId]
  )
}

export async function bulkUpsertScoringBase(rows: Record<string, any>[]) {
  if (rows.length === 0) return []
  const cols = Object.keys(rows[0])
  const values: any[] = []
  const rowsSql = rows.map((rec, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(rec[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  const updateSet = cols.filter((c) => c !== 'security_identifier').map((c) => `"${c}" = excluded."${c}"`)
  const { rows: upserted } = await pool.query(
    `insert into scoring_base (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}
     on conflict (security_identifier) do update set ${updateSet.join(', ')}
     returning id`,
    values
  )
  return upserted
}

export async function insertAssetMasterIgnoreDuplicates(rows: Record<string, any>[]) {
  if (rows.length === 0) return []
  const cols = Object.keys(rows[0])
  const values: any[] = []
  const rowsSql = rows.map((rec, i) => {
    const placeholders = cols.map((c, j) => {
      values.push(rec[c])
      return `$${i * cols.length + j + 1}`
    })
    return `(${placeholders.join(', ')})`
  })
  const { rows: inserted } = await pool.query(
    `insert into asset_master (${cols.map((c) => `"${c}"`).join(', ')}) values ${rowsSql.join(', ')}
     on conflict (identifier) do nothing
     returning id`,
    values
  )
  return inserted
}

export async function getReviewsByPeriod(periodId: string) {
  const { rows } = await pool.query(
    `select portfolio_profile, client_profile, pending_weight from portfolio_reviews where period_id = $1`,
    [periodId]
  )
  return rows
}
