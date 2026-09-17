import { NextRequest, NextResponse } from 'next/server'
import { syncFundMonitor } from '@/lib/fundMonitor/sync'

export const maxDuration = 300 // 5 minutos — Railway mata la función después de esto

// Disparo manual/por HTTP de la sincronización (protegido por CRON_SECRET).
// El disparo AUTOMÁTICO diario vive en instrumentation.ts, no en un cron de
// Vercel — la app corre en Railway, que no lee vercel.json.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
  try {
    const result = await syncFundMonitor({ force })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
