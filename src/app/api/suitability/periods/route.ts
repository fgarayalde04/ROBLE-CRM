import { NextResponse } from 'next/server'
import { listScoringPeriods, createScoringPeriod } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await listScoringPeriods()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { period_year, period_quarter, notes } = await req.json()
    if (!period_year || !period_quarter) {
      return NextResponse.json({ error: 'period_year y period_quarter requeridos' }, { status: 400 })
    }

    const data = await createScoringPeriod(period_year, period_quarter, notes || null, session.id)
    return NextResponse.json(data)
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un scoring para ese período' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
