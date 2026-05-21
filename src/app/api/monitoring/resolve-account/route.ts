import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/resolve-account
// Marks all monitoring_records with this account_number as is_new_account = false
// and recalculates new_accounts_detected on affected runs
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_number } = await req.json()
  if (!account_number) return NextResponse.json({ error: 'account_number requerido' }, { status: 400 })

  // 1. Get affected run IDs before updating
  const { data: affected } = await supabaseAdmin
    .from('monitoring_records')
    .select('monitoring_run_id')
    .ilike('account_number', account_number.trim())
    .eq('is_new_account', true)

  const seen = new Set<string>()
  const runIds: string[] = []
  for (const r of (affected ?? [])) {
    if (!seen.has(r.monitoring_run_id)) { seen.add(r.monitoring_run_id); runIds.push(r.monitoring_run_id) }
  }

  // 2. Update all matching records
  const { error } = await supabaseAdmin
    .from('monitoring_records')
    .update({ is_new_account: false })
    .ilike('account_number', account_number.trim())

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 3. Recalculate new_accounts_detected for affected runs
  for (const runId of runIds) {
    const { count } = await supabaseAdmin
      .from('monitoring_records')
      .select('*', { count: 'exact', head: true })
      .eq('monitoring_run_id', runId)
      .eq('is_new_account', true)

    await supabaseAdmin
      .from('monitoring_runs')
      .update({ new_accounts_detected: count ?? 0 })
      .eq('id', runId)
  }

  return NextResponse.json({ ok: true, runs_updated: runIds.length })
}
