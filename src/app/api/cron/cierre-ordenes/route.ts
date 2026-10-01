import { NextRequest, NextResponse } from 'next/server'
import { enviarCierreDia } from '@/lib/notifications/cierreOrdenes'
import { hoyMontevideo } from '@/lib/db/cierreOrdenes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/cierre-ordenes[?fecha=YYYY-MM-DD]
 * Manda el cierre del día de Órdenes (notificación + push). Lo dispara
 * instrumentation.ts a la hora de cierre en días hábiles; también sirve como
 * gatillo manual. Cada persona lo recibe una sola vez por día aunque se llame
 * varias veces. Protegida igual que /api/cron/sync con Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const fecha = req.nextUrl.searchParams.get('fecha') ?? hoyMontevideo()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await enviarCierreDia(fecha)) })
  } catch (err: any) {
    console.error('[cron/cierre-ordenes] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
