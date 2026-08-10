import { NextResponse } from 'next/server'
import { searchAssetMaster, upsertAssetMaster, updateAssetMaster, deleteAssetMaster } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const data = await searchAssetMaster({
      q: searchParams.get('q')?.trim() ?? '',
      assetClass: searchParams.get('asset_class') ?? '',
      scoreMin: parseFloat(searchParams.get('score_min') ?? '0'),
      scoreMax: parseFloat(searchParams.get('score_max') ?? '10'),
      needsReview: searchParams.get('needs_review') === 'true',
    })
    return NextResponse.json(data)
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

    const data = await upsertAssetMaster({
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
    })
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

    const data = await updateAssetMaster(id, allowed)
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

    await deleteAssetMaster(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
