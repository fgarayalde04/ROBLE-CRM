import { NextRequest, NextResponse } from 'next/server'
import { checkEmailReplies } from '@/lib/cron/checkEmailReplies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/check-email-replies
 * La corrida periódica real vive en src/instrumentation.ts (setInterval, ya
 * que la app corre como proceso long-running en Railway). Esta ruta queda
 * como gatillo manual — para pruebas o un ping externo puntual — protegida
 * igual que /api/cron/sync con el mismo header Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await checkEmailReplies()
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[cron/check-email-replies] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
