import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { calculatePortfolioScore, generateExplanation } from '@/lib/risk-scoring'

export async function GET(
  _req: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { uploadId } = params

    const [{ data: review, error: revErr }, { data: positions, error: posErr }] = await Promise.all([
      supabaseAdmin
        .from('portfolio_reviews')
        .select('*, crm_users!uploaded_by ( name )')
        .eq('id', uploadId)
        .single(),
      supabaseAdmin
        .from('portfolio_positions')
        .select('*')
        .eq('review_id', uploadId)
        .order('weight', { ascending: false, nullsFirst: false }),
    ])

    if (revErr) throw revErr
    if (posErr) throw posErr

    return NextResponse.json({ review, positions: positions ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update review notes or re-score after manual overrides
export async function PATCH(
  req: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { uploadId } = params
    const body = await req.json()

    // If action === 'rescore', recalculate from current positions
    if (body.action === 'rescore') {
      const { data: review } = await supabaseAdmin
        .from('portfolio_reviews')
        .select('client_profile')
        .eq('id', uploadId)
        .single()

      const { data: positions } = await supabaseAdmin
        .from('portfolio_positions')
        .select('raw_name, market_value, weight, risk_score, asset_class, classification_status')
        .eq('review_id', uploadId)

      if (!positions) return NextResponse.json({ error: 'No positions found' }, { status: 404 })

      const scoredForCalc = positions.map(p => ({
        raw_name:              p.raw_name,
        market_value:          p.market_value ?? 0,
        weight:                p.weight ?? 0,
        risk_score:            p.risk_score ?? null,
        asset_class:           p.asset_class ?? null,
        classification_status: (p.classification_status ?? 'pending') as 'classified' | 'pending' | 'manual',
      }))

      const clientProfile = (review?.client_profile ?? 'moderado') as any
      const { score, profile, classified_weight, pending_weight } = calculatePortfolioScore(scoredForCalc)
      const aligned = profile === clientProfile
      const explanation = generateExplanation(score, profile, clientProfile, aligned, pending_weight)

      const { data: updated, error } = await supabaseAdmin
        .from('portfolio_reviews')
        .update({
          portfolio_score:   Math.round(score * 100) / 100,
          portfolio_profile: profile,
          classified_weight: Math.round(classified_weight * 10) / 10,
          pending_weight:    Math.round(pending_weight * 10) / 10,
          explanation,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', uploadId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json(updated)
    }

    // Otherwise update notes/client_profile fields
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.notes !== undefined)          update.notes = body.notes
    if (body.client_profile !== undefined) update.client_profile = body.client_profile

    const { data, error } = await supabaseAdmin
      .from('portfolio_reviews')
      .update(update)
      .eq('id', uploadId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
