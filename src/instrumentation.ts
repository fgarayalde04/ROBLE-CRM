/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Sets up automatic SharePoint sync on a configurable interval.
 *
 * Configure via .env.local:
 *   SYNC_INTERVAL_MINUTES=1    (default: 1 — runs every minute)
 *   SYNC_ON_STARTUP=true       (default: true — syncs immediately on startup)
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    console.log('[auto-sync] Microsoft not configured — auto-sync disabled')
    return
  }

  const { syncAll } = await import('@/lib/microsoft/sync')
  const { supabaseAdmin } = await import('@/lib/supabase/admin')

  const parsedInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '1', 10)
  const intervalMins = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1
  const runOnStartup = process.env.SYNC_ON_STARTUP !== 'false'

  const MONTH_NAMES = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','setiembre','octubre','noviembre','diciembre',
  ]

  // Track last reset so we only reset once per month
  let lastResetMonth = ''

  async function maybeResetPayments() {
    const now = new Date()
    const key = `${now.getFullYear()}-${now.getMonth()}`
    if (lastResetMonth === key) return
    lastResetMonth = key
    const monthName = MONTH_NAMES[now.getMonth()]
    console.log(`[auto-sync] Resetting payment status for "${monthName}"...`)
    const { error } = await supabaseAdmin
      .from('monthly_payment_values')
      .update({ payment_status: 'pendiente', paid_at: null, updated_at: now.toISOString() })
      .eq('month', monthName)
      .neq('payment_status', 'pendiente')
    if (error) console.error('[auto-sync] Reset error:', error.message)
    else console.log(`[auto-sync] Payments reset to pendiente for ${monthName}`)
  }

  async function runAll() {
    console.log('[auto-sync] Starting scheduled sync...')
    try {
      await maybeResetPayments()
      await syncAll()
      console.log('[auto-sync] Sync complete.')
    } catch (e) {
      console.error('[auto-sync] Error:', e)
    }
  }

  if (runOnStartup) {
    setTimeout(() => runAll(), 5000)
  }

  const intervalMs = intervalMins * 60 * 1000
  setInterval(() => runAll(), intervalMs)

  console.log(
    `[auto-sync] Scheduled — interval: ${intervalMins} min, startup sync: ${runOnStartup}`
  )
}
