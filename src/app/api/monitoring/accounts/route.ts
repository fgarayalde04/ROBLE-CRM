import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// GET /api/monitoring/accounts?entity=roble
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') ?? 'roble'

  const { data, error } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .select('*')
    .eq('entity', entity)
    .order('is_active', { ascending: false })
    .order('needs_review', { ascending: false })
    .order('account_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}

// POST /api/monitoring/accounts — bulk upsert
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const entity: string = body.entity ?? 'roble'
  const accounts: any[] = (body.accounts ?? []).map((a: any) => ({ ...a, entity }))
  if (!accounts.length) return NextResponse.json({ error: 'Sin cuentas' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .upsert(accounts, { onConflict: 'account_number,entity', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, count: accounts.length })
}
