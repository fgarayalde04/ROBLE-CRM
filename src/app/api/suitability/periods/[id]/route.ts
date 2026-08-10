import { NextResponse } from 'next/server'
import { getScoringPeriodWithReviews, updateScoringPeriod, deleteScoringPeriod } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await getScoringPeriodWithReviews(params.id)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const allowed: Record<string, unknown> = {}
    if (body.status !== undefined) allowed.status = body.status
    if (body.notes  !== undefined) allowed.notes  = body.notes

    const data = await updateScoringPeriod(params.id, allowed)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

    await deleteScoringPeriod(params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
