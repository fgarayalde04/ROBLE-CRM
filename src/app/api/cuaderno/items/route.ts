import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET /api/cuaderno/items?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  // Fetch own items + items shared with me
  const [ownRes, sharedRes] = await Promise.all([
    supabaseAdmin
      .from('cuaderno_items')
      .select('*')
      .eq('owner_name', session.name)
      .eq('entry_date', date)
      .order('position'),
    supabaseAdmin
      .from('cuaderno_items')
      .select('*')
      .eq('entry_date', date)
      .contains('shared_with', [session.name])
      .order('created_at'),
  ])

  const own    = ownRes.data    ?? []
  const shared = sharedRes.data ?? []

  // Dedupe by id
  const map = new Map<string, any>()
  for (const it of [...own, ...shared]) map.set(it.id, it)

  // Fetch users for sharing picker
  const { data: usersRaw } = await supabaseAdmin
    .from('users')
    .select('name')
    .neq('name', session.name)
    .order('name')

  const users = (usersRaw ?? []).map((u: any) => u.name).filter(Boolean)

  return NextResponse.json({ items: Array.from(map.values()), users, currentUser: session.name })
}

// POST /api/cuaderno/items
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { entry_date, title, comments, shared_with, position } = body

  const { data, error } = await supabaseAdmin
    .from('cuaderno_items')
    .insert({
      owner_name:  session.name,
      entry_date,
      title:       title?.trim() ?? '',
      comments:    comments?.trim() ?? '',
      shared_with: Array.isArray(shared_with) ? shared_with : [],
      position:    position ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
