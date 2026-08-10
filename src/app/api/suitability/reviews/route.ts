import { NextResponse } from 'next/server'
import { listPortfolioReviews, deletePortfolioReview } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('client_id')
    const advisor  = searchParams.get('advisor')
    const limit    = parseInt(searchParams.get('limit') ?? '200', 10)

    const enriched = await listPortfolioReviews(clientId, advisor, limit)
    return NextResponse.json(enriched)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await deletePortfolioReview(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
