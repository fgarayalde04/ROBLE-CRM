import { NextRequest, NextResponse } from 'next/server'
import { processMesaInbox, isReplyWatchEnabled } from '@/lib/mailWatch/processMesaInbox'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/check-email-replies
 * Chequeo de respaldo de respuestas de clientes en trading@ (el aviso
 * instantáneo llega por /api/webhooks/gmail). Lo dispara instrumentation.ts
 * con un setInterval; también sirve como gatillo manual. Protegida igual que
 * /api/cron/sync con Bearer CRON_SECRET.
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
    return NextResponse.json(await processMesaInbox('poll'))
  } catch (err: any) {
    console.error('[cron/check-email-replies] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
