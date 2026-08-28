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

  // Independiente del auto-sync de SharePoint de abajo — no depende de
  // credenciales de Microsoft, así que se registra antes del early return.
  registerEmailReplyCheck()

  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    console.log('[auto-sync] Microsoft not configured — auto-sync disabled')
    return
  }

  const { syncAll } = await import('@/lib/microsoft/sync')
  const { resetMonthlyPaymentStatus } = await import('@/lib/db/sync')

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
    try {
      await resetMonthlyPaymentStatus(monthName)
      console.log(`[auto-sync] Payments reset to pendiente for ${monthName}`)
    } catch (e: any) {
      console.error('[auto-sync] Reset error:', e.message)
    }
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

/**
 * Detección de respuestas de cliente a mails de confirmación de orden.
 * Igual que el auto-sync de arriba: la app corre long-running en Railway, así
 * que esto es un setInterval en vez de un cron serverless.
 *
 * Se dispara con un fetch a su propia ruta /api/cron/check-email-replies (en
 * vez de importar checkEmailReplies() directo) a propósito: esa cadena de
 * imports pasa por web-push (para el push), que usa 'crypto'/'stream' de
 * Node — Next no puede empaquetar eso en el bundle de instrumentation.ts y
 * el build de producción falla ("Module not found: Can't resolve 'crypto'").
 * Las rutas /api/* sí se empaquetan aparte sin ese problema (por eso otras
 * rutas que ya importan orderEvents.ts/web-push compilan bien), así que
 * pegarle por HTTP a la ruta evita el problema de raíz.
 *
 * Configure via .env.local:
 *   EMAIL_REPLY_CHECK_INTERVAL_MINUTES=1   (default: 1 — corre cada minuto)
 */
function registerEmailReplyCheck() {
  const parsedInterval = parseInt(process.env.EMAIL_REPLY_CHECK_INTERVAL_MINUTES ?? '1', 10)
  const intervalMins = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1
  const intervalMs = intervalMins * 60 * 1000
  const port = process.env.PORT ?? '3000'
  const cronSecret = process.env.CRON_SECRET

  async function runCheck() {
    // Heartbeat en la DB en cada corrida (éxito o error) — sin esto no había
    // forma de saber, sin acceso a los logs de Railway, si este setInterval
    // realmente sigue corriendo cada minuto como debería.
    const { recordCheckHeartbeat } = await import('@/lib/db/emailReplies')
    try {
      const res = await fetch(`http://localhost:${port}/api/cron/check-email-replies`, {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : undefined,
      })
      const result = await res.json()
      if (!res.ok) {
        await recordCheckHeartbeat('http_error', `${res.status} ${JSON.stringify(result)}`)
        return
      }
      if (result.skipped) {
        await recordCheckHeartbeat('skipped', result.reason ?? null)
        return
      }
      await recordCheckHeartbeat('ok', JSON.stringify(result))
      if ((result.inserted ?? 0) > 0) {
        console.log('[email-replies] ', JSON.stringify(result))
      }
    } catch (e: any) {
      console.error('[email-replies] Error:', e.message)
      await recordCheckHeartbeat('fetch_error', e.message)
    }
  }

  setTimeout(() => runCheck(), 15000)
  setInterval(() => runCheck(), intervalMs)
  console.log(`[email-replies] Scheduled — interval: ${intervalMins} min`)
}
