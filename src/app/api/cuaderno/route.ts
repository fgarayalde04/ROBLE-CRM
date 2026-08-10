import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCuadernoEntry, upsertCuadernoEntry } from '@/lib/db/cuaderno'

// GET /api/cuaderno?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const data = await getCuadernoEntry(session.name, date)
  return NextResponse.json(data ?? { entry_date: date, notes: '', items: [] })
}

// PUT /api/cuaderno
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { entry_date, notes, items } = body

  const data = await upsertCuadernoEntry(session.name, entry_date, notes ?? '', items ?? [])
  return NextResponse.json({ ok: true, data })
}
