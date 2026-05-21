import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// PATCH /api/monitoring/accounts/close — mark account as inactive by account_number or account_name
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_number, account_name, entity } = await req.json()
  if (!account_number && !account_name) {
    return NextResponse.json({ error: 'account_number o account_name requerido' }, { status: 400 })
  }

  const ent = entity ?? 'roble'
  const update = { is_active: false, comments: 'Cuenta cerrada', updated_at: new Date().toISOString() }

  if (account_number) {
    await supabaseAdmin
      .from('monitoring_base_accounts')
      .update(update)
      .ilike('account_number', account_number.trim())
      .eq('entity', ent)
  } else if (account_name) {
    await supabaseAdmin
      .from('monitoring_base_accounts')
      .update(update)
      .ilike('account_name', account_name.trim())
      .eq('entity', ent)
  }

  return NextResponse.json({ ok: true })
}
