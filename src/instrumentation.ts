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

  // El esquema de esta base tiene que estar al día. Va por fetch a su propia
  // ruta /api/cron/migrate: importar pg/fs acá rompe el bundle de edge (mismo
  // motivo que el Monitor de Fondos). Reintenta hasta que el server escuche.
  ;(async () => {
    const port = process.env.PORT ?? '3000'
    const headers: Record<string, string> = {}
    if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/cron/migrate`, { headers })
        if (res.ok) return
        console.error('[migrate] respuesta', res.status)
        return
      } catch {
        // el server todavía no está escuchando
      }
    }
    console.error('[migrate] no se pudo contactar a la app para migrar')
  })()

  // Independiente del auto-sync de SharePoint de abajo — no depende de
  // credenciales de Microsoft, así que se registra antes del early return.
  registerEmailReplyWatch()

  // Independiente del sync de Microsoft/SharePoint de abajo — no debe
  // quedar sin registrarse solo porque esa integración no está configurada.
  await registerFundMonitorSync()

  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    console.log('[auto-sync] Microsoft not configured — auto-sync disabled')
    return
  }

  const { syncAll } = await import('@/lib/microsoft/sync')
  const { resetMonthlyPaymentStatus, getLastSyncStartedAt } = await import('@/lib/db/sync')

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
  } else {
    // El timer arranca de cero en cada reinicio (cada deploy), así que con un
    // intervalo largo y deploys frecuentes el sync programado nunca llegaba a
    // correr y los clientes nuevos no aparecían. Al arrancar se mira cuándo
    // fue la última corrida (sync_logs) y, si ya pasó el intervalo, se hace
    // ahora en vez de esperar otro intervalo completo.
    setTimeout(async () => {
      try {
        const last = await getLastSyncStartedAt('clientes')
        if (!last || Date.now() - last.getTime() >= intervalMins * 60 * 1000) runAll()
      } catch (e) {
        console.error('[auto-sync] No se pudo consultar la última corrida:', e)
      }
    }, 5000)
  }

  const intervalMs = intervalMins * 60 * 1000
  setInterval(() => runAll(), intervalMs)

  console.log(
    `[auto-sync] Scheduled — interval: ${intervalMins} min, startup sync: ${runOnStartup}`
  )
}

// El Monitor de Fondos (Davinci) tenía su corrida diaria definida como cron
// de Vercel en vercel.json — pero la app corre en Railway, que no lee ese
// archivo, así que esa corrida nunca se disparaba sola.
//
// Importa el browser headless (@sparticuz/chromium-min) — Next.js también
// compila instrumentation.ts para el runtime EDGE (aunque el guard de
// arriba lo descarte en tiempo de ejecución), y ese paquete no se puede
// bundlear ni externalizar ahí (rompe el build con un error de sintaxis en
// el bundle de edge). Por eso, en vez de llamar a syncFundMonitor()
// directo, se le pega por HTTP a la ruta /api/cron/fund-monitor-sync
// (que sí compila bien — ahí @sparticuz/chromium-min ya está en
// serverComponentsExternalPackages) — mismo mecanismo que usaría un cron
// externo, solo que disparado desde el propio proceso.
async function registerFundMonitorSync() {
  if (!process.env.DAVINCI_EMAIL || !process.env.DAVINCI_PASSWORD) {
    console.log('[fund-monitor] Davinci no configurado — auto-sync del Monitor de Fondos deshabilitado')
    return
  }

  const SYNC_HOUR_UTC = 8 // 05:00 en Montevideo (UTC-3) — antes de que abran los mercados
  const port = process.env.PORT ?? '3000'
  const url = `http://127.0.0.1:${port}/api/cron/fund-monitor-sync`

  async function maybeSync() {
    if (new Date().getUTCHours() < SYNC_HOUR_UTC) return
    try {
      const headers: Record<string, string> = {}
      if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`
      const res = await fetch(url, { headers })
      const data = await res.json()
      if (!res.ok) {
        console.error('[fund-monitor] Error en el sync diario:', data.error ?? res.status)
      } else if (!data.skipped) {
        console.log(`[fund-monitor] Sync diario: ${data.ok}/${data.total} ok, ${data.no_source} sin fuente, ${data.error} con error`)
      }
    } catch (e: any) {
      console.error('[fund-monitor] Error en el sync diario:', e.message)
    }
  }

  // Chequea cada 15 minutos si ya pasó la hora de corrida y todavía no se
  // hizo hoy — si un intento falla (ej. Davinci caído), el próximo chequeo
  // reintenta solo, sin esperar al día siguiente.
  setTimeout(() => maybeSync(), 15000)
  setInterval(() => maybeSync(), 15 * 60 * 1000)
  console.log(`[fund-monitor] Auto-sync programado — corre una vez por día después de las ${SYNC_HOUR_UTC}:00 UTC`)
}

/**
 * Respuestas de clientes en trading@ (Gmail push). Solo si
 * GMAIL_REPLY_WATCH_ENABLED=true — ver processMesaInbox.ts.
 *
 * Hace dos cosas, ambas con un fetch a su propia ruta /api/cron/* en vez de
 * importar el código directo: esa cadena de imports pasa por web-push, que usa
 * 'crypto'/'stream' de Node — Next no puede empaquetar eso en el bundle de
 * instrumentation.ts (falla el build de producción). Las rutas /api/* sí se
 * empaquetan aparte sin ese problema.
 *
 *  1. Registra/renueva el watch de Gmail (al arrancar y cada 6 h; vence a los 7
 *     días). Necesita GMAIL_PUSH_TOPIC; sin eso no hay push instantáneo.
 *  2. Chequeo periódico. Sin push es la única vía, así que corre cada 15 s
 *     (detección casi instantánea: la llamada a Gmail es una sola y liviana, el
 *     límite de la API es órdenes de magnitud mayor). Con push configurado queda
 *     como respaldo por si se pierde un aviso de Pub/Sub, cada 5 min.
 *
 * Configure via .env.local:
 *   GMAIL_REPLY_WATCH_ENABLED=true
 *   GMAIL_PUSH_TOPIC=projects/<proyecto>/topics/<topic>
 *   GMAIL_PUSH_TOKEN=<secreto que va en la URL de la suscripción de Pub/Sub>
 *   EMAIL_REPLY_CHECK_INTERVAL_SECONDS=  (opcional, pisa el default de arriba; mínimo 5)
 */
function registerEmailReplyWatch() {
  if (process.env.GMAIL_REPLY_WATCH_ENABLED !== 'true') return

  const pushConfigured = !!process.env.GMAIL_PUSH_TOPIC
  const defaultSecs = pushConfigured ? 300 : 15
  const parsed = parseInt(process.env.EMAIL_REPLY_CHECK_INTERVAL_SECONDS ?? '', 10)
  const intervalSecs = Number.isFinite(parsed) && parsed >= 5 ? parsed : defaultSecs
  const port = process.env.PORT ?? '3000'
  const cronSecret = process.env.CRON_SECRET

  async function callCron(path: string, label: string) {
    try {
      const res = await fetch(`http://localhost:${port}${path}`, {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : undefined,
      })
      const result = await res.json()
      if (!res.ok) console.error(`[${label}] ${res.status}`, JSON.stringify(result))
      else if (result.notified > 0 || result.seeded || process.env.EMAIL_REPLY_DEBUG === 'true' || (!result.skipped && label === 'gmail-watch')) {
        console.log(`[${label}]`, JSON.stringify(result))
      }
    } catch (e: any) {
      console.error(`[${label}] Error:`, e.message)
    }
  }

  if (pushConfigured) {
    const SIX_HOURS = 6 * 60 * 60 * 1000
    setTimeout(() => callCron('/api/cron/gmail-watch', 'gmail-watch'), 20000)
    setInterval(() => callCron('/api/cron/gmail-watch', 'gmail-watch'), SIX_HOURS)
  }
  setTimeout(() => callCron('/api/cron/check-email-replies', 'email-replies'), 25000)
  setInterval(() => callCron('/api/cron/check-email-replies', 'email-replies'), intervalSecs * 1000)
  console.log(`[email-replies] Scheduled — check every ${intervalSecs} s, push ${pushConfigured ? 'enabled' : 'NOT configured'}`)
}
