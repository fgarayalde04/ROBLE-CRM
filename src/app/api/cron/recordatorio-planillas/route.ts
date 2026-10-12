import { NextRequest, NextResponse } from 'next/server'
import { enviarRecordatorioPlanillas } from '@/lib/notifications/recordatorioPlanillas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/recordatorio-planillas?mes=YYYY-MM
 * Recordatorio de hacer las planillas de acciones. Lo dispara
 * instrumentation.ts el día 5 de cada mes; también sirve como gatillo manual.
 * Protegida con Bearer CRON_SECRET como el resto de /api/cron.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const mes = req.nextUrl.searchParams.get('mes') ?? ''
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'mes inválido (YYYY-MM)' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await enviarRecordatorioPlanillas(mes)) })
  } catch (err: any) {
    console.error('[cron/recordatorio-planillas] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
