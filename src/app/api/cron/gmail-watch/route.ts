import { NextRequest, NextResponse } from 'next/server'
import { isReplyWatchEnabled } from '@/lib/mailWatch/processMesaInbox'
import { ensureMailWatch } from '@/lib/mailWatch/watch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/gmail-watch
 * Registra/renueva el watch de Gmail sobre trading@ (vence a los 7 días).
 * Lo dispara instrumentation.ts al arrancar y cada pocas horas. Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isReplyWatchEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'GMAIL_REPLY_WATCH_ENABLED no está en true' })
  }

  try {
    return NextResponse.json(await ensureMailWatch())
  } catch (err: any) {
    console.error('[cron/gmail-watch] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
