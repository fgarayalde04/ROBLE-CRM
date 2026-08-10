import { NextResponse } from 'next/server'
import { getReviewWithPositions, getReviewClientProfile, getPositionsForScoring, updateReviewScore } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'
import { calculatePortfolioScore, generateExplanation } from '@/lib/risk-scoring'

export async function GET(
  _req: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { review, positions } = await getReviewWithPositions(params.uploadId)
    return NextResponse.json({ review, positions })
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

    if (body.action === 'rescore') {
      const clientProfileRaw = await getReviewClientProfile(uploadId)
      const positions = await getPositionsForScoring(uploadId)

      if (!positions || positions.length === 0) return NextResponse.json({ error: 'No positions found' }, { status: 404 })

      const scoredForCalc = positions.map((p) => ({
        raw_name:              p.raw_name,
        market_value:          p.market_value ?? 0,
        weight:                p.weight ?? 0,
        risk_score:            p.risk_score ?? null,
        asset_class:           p.asset_class ?? null,
        classification_status: (p.classification_status ?? 'pending') as 'classified' | 'pending' | 'manual',
      }))

      const clientProfile = (clientProfileRaw ?? 'moderado') as any
      const { score, profile, classified_weight, pending_weight } = calculatePortfolioScore(scoredForCalc)
      const aligned = profile === clientProfile
      const explanation = generateExplanation(score, profile, clientProfile, aligned, pending_weight)

      const updated = await updateReviewScore(uploadId, {
        portfolio_score:   Math.round(score * 100) / 100,
        portfolio_profile: profile,
        classified_weight: Math.round(classified_weight * 10) / 10,
        pending_weight:    Math.round(pending_weight * 10) / 10,
        explanation,
      })

      return NextResponse.json(updated)
    }

    const update: Record<string, unknown> = {}
    if (body.notes !== undefined)          update.notes = body.notes
    if (body.client_profile !== undefined) update.client_profile = body.client_profile

    const data = await updateReviewScore(uploadId, update)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
