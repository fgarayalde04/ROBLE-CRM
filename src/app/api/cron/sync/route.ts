import { NextRequest, NextResponse } from 'next/server'
import { syncAll } from '@/lib/microsoft/sync'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 300 // 5 minutes

const MONTH_NAMES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','setiembre','octubre','noviembre','diciembre',
]

let lastResetMonth = ''

async function maybeResetPayments() {
  const now = new Date()
  const key = `${now.getFullYear()}-${now.getMonth()}`
  if (lastResetMonth === key) return
  lastResetMonth = key
  const monthName = MONTH_NAMES[now.getMonth()]
  console.log(`[cron/sync] Resetting payment status for "${monthName}"...`)
  const { error } = await supabaseAdmin
    .from('monthly_payment_values')
    .update({ payment_status: 'pendiente', paid_at: null, updated_at: new Date().toISOString() })
    .eq('month', monthName)
    .neq('payment_status', 'pendiente')
  if (error) console.error('[cron/sync] Reset error:', error.message)
}

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/sync] Starting scheduled sync...')
  try {
    await maybeResetPayments()
    const results = await syncAll()
    console.log('[cron/sync] Sync complete.', JSON.stringify(results))
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    console.error('[cron/sync] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
