import { NextRequest, NextResponse } from 'next/server'
import { runPendingMigrations } from '@/lib/db/migrate'

export const dynamic = 'force-dynamic'

// La dispara instrumentation.ts al arrancar (ver el comentario ahí).
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await runPendingMigrations()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
