/**
 * POST /api/suitability/analyze-from-onedrive
 * Downloads a file from OneDrive by scoring_file id, parses it, and creates a portfolio_review.
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { getGraphToken, downloadDriveFile } from '@/lib/microsoft/graph'
import { parseCSV, parseExcel } from '@/lib/portfolio-parser'
import { identifyInstrument } from '@/lib/openfigi'
import { scoreFromFIGI, calculatePortfolioScore, generateExplanation, ASSET_CLASS_DEFAULT_SCORE } from '@/lib/risk-scoring'
import type { AssetClass } from '@/lib/risk-scoring'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json() as {
      scoring_file_ids: string[]   // one or more ids from scoring_files table
      client_profile:  string
      notes?:          string
    }

    if (!body.scoring_file_ids?.length) {
      return NextResponse.json({ error: 'scoring_file_ids requerido' }, { status: 400 })
    }

    const clientProfile = body.client_profile ?? 'moderado'

    // Fetch scoring_files records
    const { data: scoringFiles, error: sfErr } = await supabaseAdmin
      .from('scoring_files')
      .select('id, name, drive_id, item_id, client_folder, client_id')
      .in('id', body.scoring_file_ids)

    if (sfErr) throw sfErr
    if (!scoringFiles?.length) return NextResponse.json({ error: 'Archivos no encontrados' }, { status: 404 })

    const token = await getGraphToken()
    const results: { file_name: string; review_id: string | null; error?: string }[] = []

    for (const sf of scoringFiles) {
      try {
        // Download file content from OneDrive
        const buffer = await downloadDriveFile(sf.drive_id, sf.item_id, token)

        // Parse
        const ext = sf.name.split('.').pop()?.toLowerCase() ?? ''
        const rawPositions = (ext === 'csv' || ext === 'txt')
          ? parseCSV(new TextDecoder().decode(buffer))
          : parseExcel(buffer)

        if (!rawPositions.length) {
          results.push({ file_name: sf.name, review_id: null, error: 'No se encontraron posiciones' })
          continue
        }

        // Create review
        const { data: review, error: revErr } = await supabaseAdmin
          .from('portfolio_reviews')
          .insert({
            client_id:      sf.client_id ?? null,
            client_name:    sf.client_folder ?? null,
            client_profile: clientProfile,
            uploaded_by:    session.id,
            file_name:      sf.name,
            notes:          body.notes ?? null,
          })
          .select('id')
          .single()

        if (revErr) throw revErr

        const reviewId = review.id

        // Check asset_master cache
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
          const batch = uncached.slice(i, i + 10)
          await Promise.all(batch.map(async ({ key, type }) => {
            try {
              const opts = type === 'cusip' ? { cusip: key }
                         : type === 'isin'  ? { isin: key }
                         : type === 'ticker'? { ticker: key }
                         : null
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

        // Insert positions
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
          .from('portfolio_positions')
          .insert(positionInserts)
          .select()

        // Calculate score
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

        results.push({ file_name: sf.name, review_id: reviewId })
      } catch (e: any) {
        results.push({ file_name: sf.name, review_id: null, error: e.message })
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
