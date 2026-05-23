/**
 * POST /api/suitability/analyze-from-onedrive
 * Downloads files from OneDrive, extracts client name from content, and creates portfolio_reviews.
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { getGraphToken, downloadDriveFile } from '@/lib/microsoft/graph'
import { parseCSV, parseExcel } from '@/lib/portfolio-parser'
import { identifyInstrument } from '@/lib/openfigi'
import { scoreFromFIGI, calculatePortfolioScore, generateExplanation } from '@/lib/risk-scoring'

export const maxDuration = 60

// ── Try to match a name string against the clients table ──────────────────────
async function matchClient(name: string, number?: string): Promise<{ id: string; full_name: string } | null> {
  if (!name && !number) return null

  // Try by client number first
  if (number) {
    const clean = number.replace(/\D/g, '')
    if (clean) {
      const { data } = await supabaseAdmin
        .from('clients')
        .select('id, first_name, last_name')
        .eq('client_number', clean)
        .maybeSingle()
      if (data) return { id: data.id, full_name: `${data.first_name} ${data.last_name}`.trim() }
    }
  }

  // Try by name: clean punctuation, try full match then partial
  const clean = name
    .replace(/[,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

  if (clean.length < 3) return null

  // Split into tokens and search
  const parts = clean.split(' ').filter(p => p.length > 1)
  if (!parts.length) return null

  // Build OR query: last_name OR first_name matching any token
  const orClauses = parts.flatMap(p => [
    `last_name.ilike.%${p}%`,
    `first_name.ilike.%${p}%`,
  ]).join(',')

  const { data: candidates } = await supabaseAdmin
    .from('clients')
    .select('id, first_name, last_name')
    .or(orClauses)
    .limit(10)

  if (!candidates?.length) return null

  // Score each candidate by how many tokens match
  const scored = candidates.map(c => {
    const fullName = `${c.first_name} ${c.last_name}`.toUpperCase()
    const hits = parts.filter(p => fullName.includes(p)).length
    return { ...c, hits }
  })

  const best = scored.sort((a, b) => b.hits - a.hits)[0]
  if (best.hits === 0) return null

  return { id: best.id, full_name: `${best.first_name} ${best.last_name}`.trim() }
}

// ── Core analysis logic (shared) ──────────────────────────────────────────────
async function analyzePositions(
  rawPositions: ReturnType<typeof parseCSV>['positions'],
) {
  const identifierKeys = rawPositions
    .filter(p => p.raw_identifier && p.identifier_type !== 'unknown')
    .map(p => ({ key: p.raw_identifier, type: p.identifier_type }))

  const uniqueKeysMap = new Map(identifierKeys.map(k => [k.key, k]))
  const uniqueKeys = Array.from(uniqueKeysMap.values())

  const cachedMap = new Map<string, { asset_class: string; risk_score: number; category: string; figi: string | null }>()
  if (uniqueKeys.length > 0) {
    const { data: cached } = await supabaseAdmin
      .from('asset_master')
      .select('identifier, asset_class, risk_score, category, figi')
      .in('identifier', uniqueKeys.map(k => k.key))
    for (const c of cached ?? []) cachedMap.set(c.identifier, c)
  }

  const figiMap = new Map<string, { asset_class: string; risk_score: number; category: string; figi: string | null }>()
  cachedMap.forEach((v, k) => figiMap.set(k, v))

  const uncached = uniqueKeys.filter(k => !cachedMap.has(k.key))
  for (let i = 0; i < uncached.length; i += 10) {
    await Promise.all(uncached.slice(i, i + 10).map(async ({ key, type }) => {
      try {
        const opts = type === 'cusip' ? { cusip: key } : type === 'isin' ? { isin: key } : type === 'ticker' ? { ticker: key } : null
        if (!opts) return
        const figi = await identifyInstrument(opts)
        if (!figi) return
        const scored = scoreFromFIGI(figi)
        if (!scored) return
        const entry = { asset_class: scored.assetClass, risk_score: scored.riskScore, category: scored.category, figi: figi.figi }
        figiMap.set(key, entry)
        await supabaseAdmin.from('asset_master').upsert({
          identifier: key, identifier_type: type, name: figi.name, ticker: figi.ticker,
          figi: figi.figi, asset_class: scored.assetClass, risk_score: scored.riskScore,
          category: scored.category, updated_at: new Date().toISOString(),
        }, { onConflict: 'identifier' })
      } catch { /* silent */ }
    }))
  }

  return figiMap
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json() as {
      scoring_file_ids: string[]
      client_profile:   string
      notes?:           string
    }

    if (!body.scoring_file_ids?.length) {
      return NextResponse.json({ error: 'scoring_file_ids requerido' }, { status: 400 })
    }

    const clientProfile = body.client_profile ?? 'moderado'

    const { data: scoringFiles, error: sfErr } = await supabaseAdmin
      .from('scoring_files')
      .select('id, name, drive_id, item_id, client_folder, client_id')
      .in('id', body.scoring_file_ids)

    if (sfErr) throw sfErr
    if (!scoringFiles?.length) return NextResponse.json({ error: 'Archivos no encontrados' }, { status: 404 })

    const token = await getGraphToken()
    const results: { file_name: string; review_id: string | null; client_name: string | null; error?: string }[] = []

    for (const sf of scoringFiles) {
      try {
        const buffer = await downloadDriveFile(sf.drive_id, sf.item_id, token)

        // Parse file + extract client metadata from header rows
        const ext = sf.name.split('.').pop()?.toLowerCase() ?? ''
        const { positions: rawPositions, meta } = (ext === 'csv' || ext === 'txt')
          ? parseCSV(new TextDecoder().decode(buffer))
          : parseExcel(buffer)

        if (!rawPositions.length) {
          results.push({ file_name: sf.name, review_id: null, client_name: null, error: 'No se encontraron posiciones' })
          continue
        }

        // Identify client from document content
        const matched = await matchClient(meta.client_name ?? '', meta.client_number)
        const clientId   = matched?.id   ?? sf.client_id   ?? null
        const clientName = matched?.full_name ?? meta.client_name ?? sf.client_folder ?? null

        // If we found a client, update scoring_files record with the match
        if (matched && !sf.client_id) {
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
          })
          .select('id')
          .single()

        if (revErr) throw revErr

        const reviewId = review.id
        const figiMap  = await analyzePositions(rawPositions)

        const positionInserts = rawPositions.map(p => {
          const classified = figiMap.get(p.raw_identifier)
          return {
            review_id: reviewId,
            raw_name: p.raw_name, raw_identifier: p.raw_identifier, identifier_type: p.identifier_type,
            cusip: p.cusip, isin: p.isin, ticker: p.ticker,
            figi: classified?.figi ?? null,
            quantity: p.quantity, market_value: p.market_value, weight: p.weight,
            asset_class: classified?.asset_class ?? null,
            risk_score: classified?.risk_score ?? null,
            category: classified?.category ?? null,
            classification_status: classified ? 'classified' : 'pending',
          }
        })

        const { data: savedPositions } = await supabaseAdmin
          .from('portfolio_positions').insert(positionInserts).select()

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

        results.push({ file_name: sf.name, review_id: reviewId, client_name: clientName })
      } catch (e: any) {
        results.push({ file_name: sf.name, review_id: null, client_name: null, error: e.message })
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
