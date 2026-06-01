/**
 * GET/POST/PATCH/DELETE /api/suitability/scoring-base
 * CRUD sobre la tabla scoring_base.
 */
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// ── GET — buscar/listar ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q               = searchParams.get('q')?.trim() ?? ''
    const status          = searchParams.get('status') ?? ''
    const assetClass      = searchParams.get('asset_class') ?? ''
    const needsReview     = searchParams.get('needs_review') === 'true'
    const manualOverride  = searchParams.get('manual_override') === 'true'
    const scoreMin        = parseFloat(searchParams.get('score_min') ?? '0')
    const scoreMax        = parseFloat(searchParams.get('score_max') ?? '10')

    let query = supabaseAdmin
      .from('scoring_base')
      .select('*')
      .order('times_seen', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(500)

    if (q) {
      query = query.or(
        `security_identifier.ilike.%${q}%,normalized_name.ilike.%${q}%,symbol.ilike.%${q}%,security_description.ilike.%${q}%,cusip.ilike.%${q}%,isin.ilike.%${q}%`
      )
    }
    if (status)         query = query.eq('classification_status', status)
    if (assetClass)     query = query.eq('asset_class', assetClass)
    if (needsReview)    query = query.eq('needs_review', true)
    if (manualOverride) query = query.eq('manual_override', true)
    if (!isNaN(scoreMin) && scoreMin > 0) query = query.gte('risk_score', scoreMin)
    if (!isNaN(scoreMax) && scoreMax < 10) query = query.lte('risk_score', scoreMax)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
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

    const { data, error } = await supabaseAdmin
      .from('scoring_base')
      .upsert({
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
      }, { onConflict: 'security_identifier' })
      .select()
      .single()

    if (error) throw error
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

    // Auto-set manual_override when risk_score is edited manually
    if (body.risk_score !== undefined && body.manual_override === undefined) {
      allowed['manual_override']    = true
      allowed['manual_override_by'] = session.email ?? session.id ?? null
      allowed['manual_override_at'] = new Date().toISOString()
    }
    // Explicit manual_override_by/at override
    if (body.manual_override === false) {
      allowed['manual_override_by'] = null
      allowed['manual_override_at'] = null
    }

    allowed['last_verified_at'] = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('scoring_base')
      .update(allowed)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
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

    const { error } = await supabaseAdmin.from('scoring_base').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
