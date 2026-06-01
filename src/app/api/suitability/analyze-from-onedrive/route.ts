/**
 * POST /api/suitability/analyze-from-onedrive
 * Downloads files from OneDrive, extracts client name from content, and creates portfolio_reviews.
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { getGraphToken, downloadDriveFile } from '@/lib/microsoft/graph'
import { parseCSV, parseExcel, parsePDF } from '@/lib/portfolio-parser'
import { identifyInstrument } from '@/lib/openfigi'
import { scoreFromFIGI, scoreFallback, calculatePortfolioScore, generateExplanation } from '@/lib/risk-scoring'

/**
 * Map any asset-type hint string to a risk classification.
 * Accepts both PDF section headers (pdf_asset_type) and Excel Security Type column values.
 * Per spec: bonds and stocks must NOT remain unclassified when Security Type is available.
 */
function scoreFromTypeHint(
  hint: string,
): { asset_class: string; risk_score: number; category: string } | null {
  const t = hint.toLowerCase()
  if (/corporate\s+bond|corp\s+bond/i.test(t))       return { asset_class: 'fixed_income_hy', risk_score: 6, category: 'Bono Corporativo' }
  if (/municipal\s+bond|muni/i.test(t))              return { asset_class: 'fixed_income_ig', risk_score: 2, category: 'Bono Municipal' }
  if (/government|us\s+gov|treasury/i.test(t))       return { asset_class: 'fixed_income_ig', risk_score: 3, category: 'Bono Soberano' }
  if (/fixed\s+income|bond|note\b|renta\s+fija/i.test(t)) return { asset_class: 'fixed_income_ig', risk_score: 3, category: 'Renta Fija' }
  if (/common\s+stock|ordinary|acciones?\b/i.test(t)) return { asset_class: 'equity_diversified', risk_score: 5, category: 'Acciones' }
  if (/preferred\s+stock|pref\b/i.test(t))           return { asset_class: 'equity_defensive',   risk_score: 4, category: 'Acciones Preferentes' }
  if (/equit|stock/i.test(t))                        return { asset_class: 'equity_diversified', risk_score: 5, category: 'Acciones' }
  if (/etf|exchange.?traded/i.test(t))               return { asset_class: 'fund',               risk_score: 5, category: 'ETF' }
  if (/mutual\s+fund|open.?end/i.test(t))            return { asset_class: 'fund',               risk_score: 5, category: 'Fondo Mutuo' }
  if (/money\s+market|cash/i.test(t))                return { asset_class: 'cash',               risk_score: 1, category: 'Money Market / Liquidez' }
  if (/structured/i.test(t))                         return { asset_class: 'other',              risk_score: 6, category: 'Producto Estructurado' }
  if (/annuit/i.test(t))                             return { asset_class: 'fund',               risk_score: 4, category: 'Anualidad' }
  if (/reit|real\s+estate/i.test(t))                 return { asset_class: 'real_estate',        risk_score: 6, category: 'Real Estate / REIT' }
  return null
}

export const maxDuration = 60

// ── Client match result with confidence ────────────────────────────────────────
interface MatchResult {
  id:             string
  full_name:      string
  confidence:     number   // 0–100 — how certain we are about the match
  match_type:     'number' | 'exact_name' | 'partial_name'
  detected_name:  string   // the name string we matched against
}

/**
 * Normalize a name string: uppercase, remove punctuation, collapse whitespace.
 */
function normalizeName(s: string): string {
  return s.replace(/[,\.]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * Score a CRM candidate against a set of detected name tokens.
 * Returns 0–100 confidence.
 */
function scoreCandidate(
  candidate: { first_name: string; last_name: string },
  tokens: string[],
): number {
  const fullName = normalizeName(`${candidate.first_name} ${candidate.last_name}`)
  const cTokens  = fullName.split(' ').filter(t => t.length > 1)

  // Exact full-name match → 95
  const detected = tokens.join(' ')
  if (fullName === detected) return 95

  // Count how many detected tokens appear in the candidate's full name
  const hitsInCandidate = tokens.filter(t => fullName.includes(t)).length
  // Count how many candidate tokens appear in the detected name
  const hitsInDetected  = cTokens.filter(t => detected.includes(t)).length

  if (!tokens.length) return 0

  // Combine both ratios for a balanced score
  const ratio1 = hitsInCandidate / tokens.length          // detected tokens found in CRM
  const ratio2 = hitsInDetected  / Math.max(cTokens.length, 1) // CRM tokens found in detected

  const combined = (ratio1 + ratio2) / 2
  return Math.round(combined * 90)   // max 90 for partial match
}

/**
 * Try to match one or two holder names (primary + optional secondary) plus
 * an optional client number against the CRM clients table.
 *
 * Tries in order:
 *   1. Client number (exact) → confidence 100
 *   2. Primary holder name   → token-based confidence
 *   3. Secondary holder name → token-based confidence
 *
 * Returns the best match above a minimum threshold of 40%.
 */
async function matchClient(
  primary:        string,
  secondary?:     string,
  clientNumber?:  string,
): Promise<MatchResult | null> {
  // ── 1. Match by client number (most reliable) ─────────────────────────────
  if (clientNumber) {
    // Try full alphanumeric first (e.g. "ROJ902519"), then digits-only fallback
    const digitsOnly = clientNumber.replace(/\D/g, '')
    const candidates = [clientNumber, digitsOnly].filter(
      (v, i, arr) => v.length > 0 && arr.indexOf(v) === i,
    )
    for (const num of candidates) {
      const { data } = await supabaseAdmin
        .from('clients')
        .select('id, first_name, last_name')
        .eq('client_number', num)
        .maybeSingle()
      if (data) {
        return {
          id:            data.id,
          full_name:     `${data.first_name} ${data.last_name}`.trim(),
          confidence:    100,
          match_type:    'number',
          detected_name: clientNumber,
        }
      }
    }
  }

  // ── 2. Match by name (primary, then secondary) ────────────────────────────
  const namesToTry = [primary, secondary].filter(Boolean) as string[]
  let best: MatchResult | null = null

  for (const nameRaw of namesToTry) {
    const clean  = normalizeName(nameRaw)
    if (clean.length < 3) continue

    const tokens = clean.split(' ').filter(t => t.length > 1)
    if (!tokens.length) continue

    // Query candidates: any token matches first_name or last_name
    const orClauses = tokens.flatMap(t => [
      `last_name.ilike.%${t}%`,
      `first_name.ilike.%${t}%`,
    ]).join(',')

    const { data: candidates } = await supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name')
      .or(orClauses)
      .limit(15)

    if (!candidates?.length) continue

    // Score all candidates
    const scored = candidates.map(c => ({
      ...c,
      score: scoreCandidate(c, tokens),
    }))
    const top = scored.sort((a, b) => b.score - a.score)[0]

    if (top.score < 40) continue   // below minimum threshold — skip

    const result: MatchResult = {
      id:            top.id,
      full_name:     `${top.first_name} ${top.last_name}`.trim(),
      confidence:    top.score,
      match_type:    top.score >= 90 ? 'exact_name' : 'partial_name',
      detected_name: nameRaw,
    }

    if (!best || result.confidence > best.confidence) best = result
    if (best.confidence >= 95) break   // good enough — stop searching
  }

  return best
}

// ── Re-detect identifier type for 'unknown' identifiers ──────────────────────
// When the parser couldn't auto-detect the type, attempt a format-based re-check
// before sending to OpenFIGI (avoids skipping valid CUSIPs / ISINs).
function resolveIdentifierType(
  key: string,
  type: string,
): { key: string; type: 'cusip' | 'isin' | 'ticker' } | null {
  if (type === 'cusip')  return { key, type: 'cusip' }
  if (type === 'isin')   return { key, type: 'isin'  }
  if (type === 'ticker') return { key, type: 'ticker' }
  // Re-detect from format
  const s = key.trim().toUpperCase()
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(s)) return { key: s, type: 'isin'  }
  if (/^[A-Z0-9]{9}$/.test(s))          return { key: s, type: 'cusip' }
  if (/^[A-Z]{1,6}$/.test(s))           return { key: s, type: 'ticker' }
  return null   // truly unrecognizable — skip OpenFIGI
}

// ── Resultado enriquecido del análisis de posiciones ─────────────────────────
interface AnalyzedAsset {
  asset_class:           string
  risk_score:            number
  category:              string
  figi:                  string | null
  source:                string   // 'scoring_base' | 'openfigi' | 'rules' | 'pending'
  classification_status: string   // 'classified' | 'manual' | 'pending'
  score_explanation:     string | null
  normalized_name:       string | null
  security_type:         string | null
  market_sector:         string | null
}

// ── Core analysis: scoring_base → OpenFIGI → rules ───────────────────────────
async function analyzePositions(
  rawPositions: ReturnType<typeof parseCSV>['positions'],
  clientName: string | null,
  reviewId:   string,
): Promise<{ results: Map<string, AnalyzedAsset>; cachedKeys: Set<string> }> {
  const results    = new Map<string, AnalyzedAsset>()
  const cachedKeys = new Set<string>()

  // Resolve identifiers (re-detect type for 'unknown' ones)
  const identifierKeys = rawPositions
    .filter(p => p.raw_identifier && p.raw_identifier.length >= 3)
    .map(p => {
      const resolved = resolveIdentifierType(p.raw_identifier, p.identifier_type)
      return resolved ? { key: resolved.key, type: resolved.type, original: p.raw_identifier } : null
    })
    .filter((k): k is { key: string; type: 'cusip' | 'isin' | 'ticker'; original: string } => k !== null)

  const uniqueKeysMap = new Map(identifierKeys.map(k => [k.key, k]))
  const uniqueKeys    = Array.from(uniqueKeysMap.values())

  // ── Step 1: scoring_base cache ────────────────────────────────────────────
  if (uniqueKeys.length > 0) {
    const { data: cached } = await supabaseAdmin
      .from('scoring_base')
      .select('security_identifier, asset_class, risk_score, category, figi, source, classification_status, score_explanation, normalized_name, security_type, market_sector, manual_override')
      .in('security_identifier', uniqueKeys.map(k => k.key))
    for (const c of cached ?? []) {
      if (c.risk_score != null) {
        results.set(c.security_identifier, {
          asset_class:           c.asset_class           ?? 'other',
          risk_score:            c.risk_score,
          category:              c.category              ?? '',
          figi:                  c.figi                  ?? null,
          // If manually overridden, show 'scoring_base' as source
          source:                'scoring_base',
          classification_status: 'classified',
          score_explanation:     c.score_explanation     ?? null,
          normalized_name:       c.normalized_name       ?? null,
          security_type:         c.security_type         ?? null,
          market_sector:         c.market_sector         ?? null,
        })
        cachedKeys.add(c.security_identifier)
      }
    }
  }

  // ── Step 2: OpenFIGI for uncached ─────────────────────────────────────────
  const uncached = uniqueKeys.filter(k => !results.has(k.key))
  for (let i = 0; i < uncached.length; i += 10) {
    await Promise.all(uncached.slice(i, i + 10).map(async ({ key, type }) => {
      try {
        const opts = type === 'cusip' ? { cusip: key }
                   : type === 'isin'  ? { isin:  key }
                   :                    { ticker: key }
        const figi = await identifyInstrument(opts)
        if (!figi) return

        const scored = scoreFromFIGI(figi)
        if (!scored) return

        const explanation = scored.explanation
        const entry: AnalyzedAsset = {
          asset_class:           scored.assetClass,
          risk_score:            scored.riskScore,
          category:              scored.category,
          figi:                  figi.figi,
          source:                'openfigi',
          classification_status: 'classified',
          score_explanation:     explanation,
          normalized_name:       figi.name        ?? null,
          security_type:         figi.securityType ?? null,
          market_sector:         figi.marketSector ?? null,
        }
        results.set(key, entry)

        // Save to scoring_base via RPC (handles seen-tracking + manual_override protection)
        const { error: rpcErr } = await supabaseAdmin.rpc('upsert_scoring_base_asset', {
          p_security_identifier:  key,
          p_identifier_type:      type,
          p_figi:                 figi.figi         ?? null,
          p_normalized_name:      figi.name         ?? null,
          p_symbol:               figi.ticker       ?? null,
          p_security_description: null,
          p_security_type:        figi.securityType ?? null,
          p_market_sector:        figi.marketSector ?? null,
          p_asset_class:          scored.assetClass,
          p_risk_score:           scored.riskScore,
          p_category:             scored.category,
          p_score_explanation:    explanation,
          p_source:               'openfigi',
          p_classification_status:'classified',
          p_client_name:          clientName,
          p_review_id:            reviewId,
        })
        if (rpcErr) console.error('[scoring_base] openfigi upsert error:', key, rpcErr)
      } catch (e) { console.error('[scoring_base] openfigi error:', key, e) }
    }))
  }

  return { results, cachedKeys }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json() as {
      scoring_file_ids: string[]
      client_profile:   string
      notes?:           string
      period_id?:       string
    }

    if (!body.scoring_file_ids?.length) {
      return NextResponse.json({ error: 'scoring_file_ids requerido' }, { status: 400 })
    }

    const clientProfile = body.client_profile ?? 'moderado'
    const periodId      = body.period_id ?? null

    const { data: scoringFiles, error: sfErr } = await supabaseAdmin
      .from('scoring_files')
      .select('id, name, drive_id, item_id, client_folder, client_id')
      .in('id', body.scoring_file_ids)

    if (sfErr) throw sfErr
    if (!scoringFiles?.length) return NextResponse.json({ error: 'Archivos no encontrados' }, { status: 404 })

    const token = await getGraphToken()
    const results: {
      file_name:        string
      review_id:        string | null
      client_name:      string | null
      match_confidence: number | null
      match_type:       string | null
      detected_name:    string | null
      secondary_holder: string | null
      error?:           string
    }[] = []

    for (const sf of scoringFiles) {
      try {
        const buffer = await downloadDriveFile(sf.drive_id, sf.item_id, token)

        // Parse file + extract client metadata from header zone
        const ext = sf.name.split('.').pop()?.toLowerCase() ?? ''
        const { positions: rawPositions, meta } = (ext === 'csv' || ext === 'txt')
          ? parseCSV(new TextDecoder().decode(buffer))
          : ext === 'pdf'
            ? await parsePDF(buffer)
            : parseExcel(buffer)

        if (!rawPositions.length) {
          results.push({ file_name: sf.name, review_id: null, client_name: null, match_confidence: null, match_type: null, detected_name: null, secondary_holder: null, error: 'No se encontraron posiciones' })
          continue
        }

        // Identify client: use primary_holder + secondary_holder from zone detection,
        // fall back to generic client_name if zone detection didn't find anything
        const primaryName  = meta.primary_holder  ?? meta.client_name ?? ''
        const secondaryName = meta.secondary_holder

        const matched = await matchClient(primaryName, secondaryName, meta.client_number)
        const clientId   = matched?.id   ?? sf.client_id   ?? null
        const clientName = matched?.full_name ?? (primaryName || sf.client_folder) ?? null

        // If we found a confident match, update scoring_files record
        if (matched && matched.confidence >= 60 && !sf.client_id) {
          await supabaseAdmin.from('scoring_files').update({ client_id: matched.id }).eq('id', sf.id)
        }

        // Create review
        const { data: review, error: revErr } = await supabaseAdmin
          .from('portfolio_reviews')
          .insert({
            client_id:      clientId,
            client_name:    clientName,
            client_profile: clientProfile,
            uploaded_by:    session.id,
            file_name:      sf.name,
            notes:          body.notes ?? null,
            advisor:        meta.advisor ?? null,
            period_id:      periodId,
          })
          .select('id')
          .single()

        if (revErr) throw revErr

        const reviewId = review.id
        const { results: analyzedMap, cachedKeys } = await analyzePositions(rawPositions, clientName, reviewId)

        // Collected scoring_base saves for Tiers 0/3/4 — awaited after position insert
        const scoringBaseSaves: Record<string, unknown>[] = []
        const queueScoringBase = (params: Record<string, unknown>) => {
          scoringBaseSaves.push(params)
        }

        const positionInserts = rawPositions.map(p => {
          // Helper: common base fields for all tiers
          const base = {
            review_id:       reviewId,
            raw_name:        p.raw_name,
            raw_identifier:  p.raw_identifier,
            identifier_type: p.identifier_type,
            cusip:           p.cusip ?? null,
            isin:            p.isin  ?? null,
            ticker:          p.ticker ?? null,
            security_type:   p.security_type ?? null,
            quantity:        p.quantity     ?? null,
            market_value:    p.market_value ?? null,
            weight:          p.weight       ?? null,
          }

          // ── Tier 0: Forced (Cash / Money Market — parser already classified) ─
          if (p.forced_risk_score != null) {
            const key = resolveIdentifierType(p.raw_identifier, p.identifier_type)?.key ?? p.raw_identifier
            if (key && !key.startsWith('POS_')) {
              queueScoringBase({
                p_security_identifier:  key,
                p_identifier_type:      p.identifier_type,
                p_figi:                 null,
                p_normalized_name:      null,
                p_symbol:               p.ticker ?? null,
                p_security_description: p.raw_name,
                p_security_type:        p.security_type ?? null,
                p_market_sector:        null,
                p_asset_class:          p.forced_asset_class ?? 'cash',
                p_risk_score:           p.forced_risk_score,
                p_category:             p.forced_category ?? 'Money Market / Liquidez',
                p_score_explanation:    'Clasificado automáticamente como Cash / Money Market.',
                p_source:               'rules',
                p_classification_status:'classified',
                p_client_name:          clientName,
                p_review_id:            reviewId,
              })
            }
            return {
              ...base, figi: null,
              asset_class:           p.forced_asset_class ?? 'cash',
              risk_score:            p.forced_risk_score,
              category:              p.forced_category    ?? 'Money Market / Liquidez',
              classification_status: 'classified' as const,
              source:                'rules',
              score_explanation:     'Clasificado automáticamente como Cash / Money Market.',
            }
          }

          // ── Tiers 1-2: scoring_base cache + OpenFIGI ─────────────────────────
          const resolvedKey = resolveIdentifierType(p.raw_identifier, p.identifier_type)?.key
          const fromAnalysis = analyzedMap.get(p.raw_identifier)
            ?? (resolvedKey ? analyzedMap.get(resolvedKey) : undefined)

          if (fromAnalysis) {
            return {
              ...base, figi: fromAnalysis.figi,
              security_type:         p.security_type ?? fromAnalysis.security_type ?? null,
              asset_class:           fromAnalysis.asset_class,
              risk_score:            fromAnalysis.risk_score,
              category:              fromAnalysis.category,
              classification_status: fromAnalysis.classification_status as 'classified' | 'manual' | 'pending',
              source:                fromAnalysis.source,
              score_explanation:     fromAnalysis.score_explanation,
            }
          }

          // ── Tier 3: rules fallback (scoreFallback with security_type) ────────
          const fb = scoreFallback(p.raw_name, p.identifier_type, p.security_type)
            ?? (() => {
              const hint = p.security_type ?? p.pdf_asset_type
              if (!hint) return null
              const th = scoreFromTypeHint(hint)
              if (!th) return null
              return {
                assetClass:  th.asset_class,
                riskScore:   th.risk_score,
                category:    th.category,
                explanation: `Clasificado por tipo de activo (${hint}) → Score ${th.risk_score}`,
              }
            })()

          if (fb) {
            const sbKey = resolvedKey ?? p.raw_identifier
            if (sbKey && !sbKey.startsWith('POS_')) {
              queueScoringBase({
                p_security_identifier:  sbKey,
                p_identifier_type:      p.identifier_type,
                p_figi:                 null,
                p_normalized_name:      null,
                p_symbol:               p.ticker ?? null,
                p_security_description: p.raw_name,
                p_security_type:        p.security_type ?? null,
                p_market_sector:        null,
                p_asset_class:          fb.assetClass,
                p_risk_score:           fb.riskScore,
                p_category:             fb.category,
                p_score_explanation:    fb.explanation,
                p_source:               'rules',
                p_classification_status:'classified',
                p_client_name:          clientName,
                p_review_id:            reviewId,
              })
            }
            return {
              ...base, figi: null,
              asset_class:           fb.assetClass,
              risk_score:            fb.riskScore,
              category:              fb.category,
              classification_status: 'classified' as const,
              source:                'rules',
              score_explanation:     fb.explanation,
            }
          }

          // ── Tier 4: pending ───────────────────────────────────────────────────
          const pendingKey = resolvedKey ?? p.raw_identifier
          if (pendingKey && !pendingKey.startsWith('POS_')) {
            queueScoringBase({
              p_security_identifier:  pendingKey,
              p_identifier_type:      p.identifier_type,
              p_figi:                 null,
              p_normalized_name:      null,
              p_symbol:               p.ticker ?? null,
              p_security_description: p.raw_name,
              p_security_type:        p.security_type ?? null,
              p_market_sector:        null,
              p_asset_class:          null,
              p_risk_score:           null,
              p_category:             null,
              p_score_explanation:    null,
              p_source:               'pending',
              p_classification_status:'pending',
              p_client_name:          clientName,
              p_review_id:            reviewId,
            })
          }
          return {
            ...base, figi: null,
            asset_class:           null,
            risk_score:            null,
            category:              null,
            classification_status: 'pending' as const,
            source:                'pending',
            score_explanation:     null,
          }
        })

        // ── Flush all scoring_base saves (Tiers 0/3/4) in parallel ───────────
        await Promise.allSettled(
          scoringBaseSaves.map(params =>
            supabaseAdmin.rpc('upsert_scoring_base_asset', params as any)
              .then(({ error }) => { if (error) console.error('[scoring_base] upsert error:', params.p_security_identifier, error) })
          )
        )

        const { data: savedPositions } = await supabaseAdmin
          .from('portfolio_positions').insert(positionInserts).select()

        // ── Update seen-metrics for assets that were already in scoring_base ──
        if (cachedKeys.size > 0) {
          supabaseAdmin.rpc('update_scoring_base_seen', {
            p_identifiers: Array.from(cachedKeys),
            p_client_name: clientName,
            p_review_id:   reviewId,
          }).then(
            () => {},
            (e) => console.error('[scoring_base] seen update error:', e),
          )
        }

        const scoredForCalc = (savedPositions ?? []).map(p => ({
          raw_name: p.raw_name, market_value: p.market_value ?? 0, weight: p.weight ?? 0,
          risk_score: p.risk_score ?? null, asset_class: p.asset_class ?? null,
          classification_status: p.classification_status as 'classified' | 'pending' | 'manual',
        }))

        const { score, profile, classified_weight, pending_weight } = calculatePortfolioScore(scoredForCalc)
        const aligned = profile === clientProfile
        const explanation = generateExplanation(score, profile, clientProfile as any, aligned, pending_weight)

        await supabaseAdmin.from('portfolio_reviews').update({
          portfolio_score: Math.round(score * 100) / 100,
          portfolio_profile: profile,
          classified_weight: Math.round(classified_weight * 10) / 10,
          pending_weight: Math.round(pending_weight * 10) / 10,
          explanation,
          updated_at: new Date().toISOString(),
        }).eq('id', reviewId)

        results.push({
          file_name:        sf.name,
          review_id:        reviewId,
          client_name:      clientName,
          match_confidence: matched?.confidence ?? null,
          match_type:       matched?.match_type ?? (clientName ? 'folder_name' : null),
          detected_name:    matched?.detected_name ?? (primaryName || null),
          secondary_holder: secondaryName ?? null,
        })
      } catch (e: any) {
        results.push({ file_name: sf.name, review_id: null, client_name: null, match_confidence: null, match_type: null, detected_name: null, secondary_holder: null, error: e.message })
      }
    }

    // Update period aggregate stats if this analysis belongs to a period
    if (periodId) {
      try {
        const { data: periodReviews } = await supabaseAdmin
          .from('portfolio_reviews')
          .select('portfolio_profile, client_profile, pending_weight')
          .eq('period_id', periodId)

        const total      = periodReviews?.length ?? 0
        const aligned    = periodReviews?.filter(r => r.portfolio_profile === r.client_profile).length ?? 0
        const misaligned = total - aligned
        const pending    = periodReviews?.filter(r => (r.pending_weight ?? 0) > 20).length ?? 0

        await supabaseAdmin
          .from('scoring_periods')
          .update({
            total_reviews:      total,
            clients_aligned:    aligned,
            clients_misaligned: misaligned,
            pending_assets:     pending,
            status:             'draft',
            updated_at:         new Date().toISOString(),
          })
          .eq('id', periodId)
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
