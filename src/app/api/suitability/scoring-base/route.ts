/**
 * GET/POST/PATCH/DELETE /api/suitability/scoring-base
 * CRUD sobre la tabla scoring_base.
 */
import { NextResponse } from 'next/server'
import { searchScoringBase, upsertScoringBase, updateScoringBase, deleteScoringBase } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

// ── GET — buscar/listar ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const data = await searchScoringBase({
      q: searchParams.get('q')?.trim() ?? '',
      status: searchParams.get('status') ?? '',
      assetClass: searchParams.get('asset_class') ?? '',
      needsReview: searchParams.get('needs_review') === 'true',
      manualOverride: searchParams.get('manual_override') === 'true',
      scoreMin: parseFloat(searchParams.get('score_min') ?? '0'),
      scoreMax: parseFloat(searchParams.get('score_max') ?? '10'),
    })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST — crear / upsert ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const {
      security_identifier, identifier_type,
      isin, cusip, symbol, figi,
      normalized_name, security_description, security_type, market_sector, exchange,
      asset_class, category, risk_score, score_explanation,
      source, classification_status, needs_review,
    } = body

    if (!security_identifier || risk_score == null) {
      return NextResponse.json(
        { error: 'security_identifier y risk_score son requeridos' },
        { status: 400 },
      )
    }

    const data = await upsertScoringBase({
      security_identifier: security_identifier.trim().toUpperCase(),
      identifier_type:     identifier_type    ?? 'unknown',
      isin:                isin               || null,
      cusip:               cusip              || null,
      symbol:              symbol             || null,
      figi:                figi               || null,
      normalized_name:     normalized_name    || null,
      security_description: security_description || null,
      security_type:       security_type      || null,
      market_sector:       market_sector      || null,
      exchange:            exchange           || null,
      asset_class:         asset_class        || null,
      category:            category           || null,
      risk_score:          parseFloat(risk_score),
      score_explanation:   score_explanation  || null,
      source:              source             || 'manual',
      classification_status: classification_status || 'classified',
      needs_review:        needs_review       ?? false,
      last_verified_at:    new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH — actualizar por id ─────────────────────────────────────────────────
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const body = await req.json()
    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const fields = [
      'normalized_name', 'security_description', 'security_type', 'market_sector',
      'asset_class', 'category', 'risk_score', 'score_explanation',
      'source', 'classification_status', 'needs_review', 'symbol', 'isin', 'cusip',
      'manual_override',
    ]
    for (const f of fields) {
      if (body[f] !== undefined)
        allowed[f] = f === 'risk_score' ? parseFloat(body[f]) : body[f]
    }

    if (body.risk_score !== undefined && body.manual_override === undefined) {
      allowed['manual_override']    = true
      allowed['manual_override_by'] = session.email ?? session.id ?? null
      allowed['manual_override_at'] = new Date().toISOString()
    }
    if (body.manual_override === false) {
      allowed['manual_override_by'] = null
      allowed['manual_override_at'] = null
    }

    allowed['last_verified_at'] = new Date().toISOString()

    const data = await updateScoringBase(id, allowed)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE — sólo admin ───────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.role !== 'admin')
      return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    await deleteScoringBase(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
