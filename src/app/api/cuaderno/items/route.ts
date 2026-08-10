import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCuadernoItems, listOtherUsers, createCuadernoItem } from '@/lib/db/cuaderno'

// GET /api/cuaderno/items?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const [items, users] = await Promise.all([
    getCuadernoItems(session.name, date),
    listOtherUsers(session.name),
  ])

  return NextResponse.json({ items, users, currentUser: session.name })
}

// POST /api/cuaderno/items
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { entry_date, title, comments, shared_with, position } = body

  const item = await createCuadernoItem({
    ownerName: session.name,
    entryDate: entry_date,
    title: title?.trim() ?? '',
    comments: comments?.trim() ?? '',
    sharedWith: Array.isArray(shared_with) ? shared_with : [],
    position: position ?? 0,
  })

  return NextResponse.json({ ok: true, item })
}
