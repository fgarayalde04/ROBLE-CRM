import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { parseCSV, parseExcel } from '@/lib/portfolio-parser'
import { identifyInstrument } from '@/lib/openfigi'
import { scoreFromFIGI, calculatePortfolioScore, generateExplanation, scoreToProfile } from '@/lib/risk-scoring'

export const maxDuration = 60 // 60s for OpenFIGI calls

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const form = await req.formData()
    const file    = form.get('file') as File | null
    const clientId = form.get('client_id') as string | null
    const clientName = form.get('client_name') as string | null
    const clientProfile = (form.get('client_profile') as string | null) ?? 'moderado'
    const notes = form.get('notes') as string | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    // Parse the file
    const fileName = file.name
    const ext = fileName.split('.').pop()?.toLowerCase()
    let rawPositions: ReturnType<typeof parseCSV>['positions']
    let fileMeta:     ReturnType<typeof parseCSV>['meta'] = {}

    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text()
      const result = parseCSV(text)
      rawPositions = result.positions
      fileMeta     = result.meta
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer()
      const result = parseExcel(buffer)
      rawPositions = result.positions
      fileMeta     = result.meta
    } else {
      return NextResponse.json({ error: 'Formato no soportado. Use CSV o Excel (.xlsx).' }, { status: 400 })
    }

    if (!rawPositions.length) {
      return NextResponse.json({ error: 'No se encontraron posiciones en el archivo.' }, { status: 400 })
    }

    // If no client was specified manually, try to detect from file content
    const resolvedClientName = clientName || fileMeta.client_name || null

    // Create the review record first
    const { data: review, error: reviewErr } = await supabaseAdmin
      .from('portfolio_reviews')
      .insert({
        client_id:      clientId || null,
        client_name:    resolvedClientName,
        client_profile: clientProfile,
        uploaded_by:    session.id,
        file_name:      fileName,
        notes:          notes || null,
        portfolio_score:     null,
        portfolio_profile:   null,
        classified_weight:   null,
        pending_weight:      null,
        explanation:         null,
      })
      .select('id')
      .single()

    if (reviewErr) throw reviewErr

    const reviewId = review.id

    // Identify instruments via OpenFIGI (batch: max 100 per request)
    // First check the asset_master cache to avoid re-querying known instruments
    const identifierKeys = rawPositions
      .filter(p => p.raw_identifier && p.identifier_type !== 'unknown')
      .map(p => ({ key: p.raw_identifier, type: p.identifier_type }))

    const uniqueKeysMap = new Map(identifierKeys.map(k => [k.key, k]))
    const uniqueKeys = Array.from(uniqueKeysMap.values())

    // Check cache
    const cachedMap = new Map<string, { asset_class: string; risk_score: number; category: string; figi: string | null }>()
    if (uniqueKeys.length > 0) {
      const { data: cached } = await supabaseAdmin
        .from('asset_master')
        .select('identifier, asset_class, risk_score, category, figi')
        .in('identifier', uniqueKeys.map(k => k.key))

      for (const c of cached ?? []) {
        cachedMap.set(c.identifier, c)
      }
    }

    // OpenFIGI for uncached instruments
    const figiMap = new Map<string, { asset_class: string; risk_score: number; category: string; figi: string | null }>()

    // Merge cache into figiMap
    cachedMap.forEach((v, k) => figiMap.set(k, v))

    // Identify uncached
    const uncached = uniqueKeys.filter(k => !cachedMap.has(k.key))

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < uncached.length; i += 10) {
      const batch = uncached.slice(i, i + 10)
      await Promise.all(
        batch.map(async ({ key, type }) => {
          try {
            const opts = type === 'cusip'  ? { cusip: key }
                        : type === 'isin'   ? { isin: key }
                        : type === 'ticker' ? { ticker: key }
                        : null
            if (!opts) return

            const figi = await identifyInstrument(opts)
            if (!figi) return

            const scored = scoreFromFIGI(figi)
            if (!scored) return

            const entry = { asset_class: scored.assetClass, risk_score: scored.riskScore, category: scored.category, figi: figi.figi }
            figiMap.set(key, entry)

            // Save to cache (upsert by identifier)
            await supabaseAdmin.from('asset_master').upsert({
              identifier:      key,
              identifier_type: type,
              name:            figi.name,
              ticker:          figi.ticker,
              figi:            figi.figi,
              asset_class:     scored.assetClass,
              risk_score:      scored.riskScore,
              category:        scored.category,
              updated_at:      new Date().toISOString(),
            }, { onConflict: 'identifier' })
          } catch (e) {
            console.error('[suitability/upload] FIGI error for', key, e)
          }
        })
      )
    }

    // Build scored positions
    type ScoredInsert = {
      review_id: string
      raw_name: string
      raw_identifier: string
      identifier_type: string
      cusip: string | undefined
      isin: string | undefined
      ticker: string | undefined
      figi: string | null
      quantity: number | undefined
      market_value: number | undefined
      weight: number | undefined
      asset_class: string | null
      risk_score: number | null
      category: string | null
      classification_status: string
    }

    const positionInserts: ScoredInsert[] = rawPositions.map(p => {
      const classified = figiMap.get(p.raw_identifier)
      return {
        review_id:             reviewId,
        raw_name:              p.raw_name,
        raw_identifier:        p.raw_identifier,
        identifier_type:       p.identifier_type,
        cusip:                 p.cusip,
        isin:                  p.isin,
        ticker:                p.ticker,
        figi:                  classified?.figi ?? null,
        quantity:              p.quantity,
        market_value:          p.market_value,
        weight:                p.weight,
        asset_class:           classified?.asset_class ?? null,
        risk_score:            classified?.risk_score ?? null,
        category:              classified?.category ?? null,
        classification_status: classified ? 'classified' : 'pending',
      }
    })

    const { data: savedPositions, error: posErr } = await supabaseAdmin
      .from('portfolio_positions')
      .insert(positionInserts)
      .select()

    if (posErr) throw posErr

    // Calculate portfolio score
    const scoredForCalc = (savedPositions ?? []).map(p => ({
      raw_name:              p.raw_name,
      market_value:          p.market_value ?? 0,
      weight:                p.weight ?? 0,
      risk_score:            p.risk_score ?? null,
      asset_class:           p.asset_class ?? null,
      classification_status: p.classification_status as 'classified' | 'pending' | 'manual',
    }))

    const { score, profile, classified_weight, pending_weight } = calculatePortfolioScore(scoredForCalc)
    const aligned = profile === clientProfile
    const explanation = generateExplanation(score, profile, clientProfile as any, aligned, pending_weight)

    // Update review with computed scores
    const { data: updatedReview, error: updateErr } = await supabaseAdmin
      .from('portfolio_reviews')
      .update({
        portfolio_score:   Math.round(score * 100) / 100,
        portfolio_profile: profile,
        classified_weight: Math.round(classified_weight * 10) / 10,
        pending_weight:    Math.round(pending_weight * 10) / 10,
        explanation,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select()
      .single()

    if (updateErr) throw updateErr

    return NextResponse.json({ review: updatedReview, positions: savedPositions })
  } catch (err: any) {
    console.error('[suitability/upload]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
