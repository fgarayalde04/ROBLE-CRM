import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET /api/cuaderno?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const { data, error } = await supabaseAdmin
    .from('cuaderno')
    .select('*')
    .eq('user_name', session.name)
    .eq('entry_date', date)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { entry_date: date, notes: '', items: [] })
}

// PUT /api/cuaderno
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { entry_date, notes, items } = body

  const { data, error } = await supabaseAdmin
    .from('cuaderno')
    .upsert(
      { user_name: session.name, entry_date, notes: notes ?? '', items: items ?? [], updated_at: new Date().toISOString() },
      { onConflict: 'user_name,entry_date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
