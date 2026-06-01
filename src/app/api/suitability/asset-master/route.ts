import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q           = searchParams.get('q')?.trim() ?? ''
    const assetClass  = searchParams.get('asset_class') ?? ''
    const scoreMin    = parseFloat(searchParams.get('score_min') ?? '0')
    const scoreMax    = parseFloat(searchParams.get('score_max') ?? '10')
    const needsReview = searchParams.get('needs_review') === 'true'

    let query = supabaseAdmin
      .from('asset_master')
      .select('id, identifier, identifier_type, name, ticker, figi, asset_class, risk_score, category, explanation, source, needs_review, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500)

    if (q) {
      query = query.or(
        `identifier.ilike.%${q}%,name.ilike.%${q}%,ticker.ilike.%${q}%,category.ilike.%${q}%`
      )
    }
    if (assetClass) query = query.eq('asset_class', assetClass)
    if (!isNaN(scoreMin) && scoreMin > 0) query = query.gte('risk_score', scoreMin)
    if (!isNaN(scoreMax) && scoreMax < 10) query = query.lte('risk_score', scoreMax)
    if (needsReview) query = query.eq('needs_review', true)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { identifier, identifier_type, name, ticker, asset_class, risk_score, category, explanation, source } = body

    if (!identifier || risk_score == null) {
      return NextResponse.json({ error: 'identifier y risk_score requeridos' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('asset_master')
      .upsert({
        identifier: identifier.trim().toUpperCase(),
        identifier_type: identifier_type ?? 'unknown',
        name: name || null,
        ticker: ticker || null,
        asset_class: asset_class || null,
        risk_score: parseFloat(risk_score),
        category: category || null,
        explanation: explanation || null,
        source: source || null,
        needs_review: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'identifier' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const body = await req.json()
    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const fields = ['name', 'ticker', 'asset_class', 'risk_score', 'category', 'explanation', 'source', 'needs_review']
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = f === 'risk_score' ? parseFloat(body[f]) : body[f]
    }

    const { data, error } = await supabaseAdmin
      .from('asset_master')
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

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await supabaseAdmin.from('asset_master').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
