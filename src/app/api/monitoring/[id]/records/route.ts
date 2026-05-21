import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// GET /api/monitoring/[id]/records
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get run entity
  const { data: run } = await supabaseAdmin
    .from('monitoring_runs')
    .select('entity')
    .eq('id', params.id)
    .single()

  // Get inactive account numbers for this entity
  const { data: inactiveAccs } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .select('account_number, account_name')
    .eq('entity', run?.entity ?? 'roble')
    .eq('is_active', false)

  const inactiveNumbers = new Set<string>()
  const inactiveNames   = new Set<string>()
  for (const a of (inactiveAccs ?? []) as any[]) {
    if (a.account_number) inactiveNumbers.add(a.account_number.trim().toUpperCase())
    if (a.account_name)   inactiveNames.add(a.account_name.trim().toUpperCase())
  }

  const { data, error } = await supabaseAdmin
    .from('monitoring_records')
    .select('*')
    .eq('monitoring_run_id', params.id)
    .order('is_new_account', { ascending: true })
    .order('client_code',    { ascending: true, nullsFirst: false })
    .order('account_name',   { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Exclude inactive accounts
  const filtered = (data ?? []).filter((r: any) => {
    const num  = (r.account_number ?? '').trim().toUpperCase()
    const name = (r.account_name   ?? '').trim().toUpperCase()
    return !(
      (num  && inactiveNumbers.has(num)) ||
      (name && inactiveNames.has(name))
    )
  })

  return NextResponse.json(filtered)
}
