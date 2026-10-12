import { NextRequest, NextResponse } from 'next/server'
import { armarPlantillasMensuales } from '@/lib/plantillas/autoMensual'
import { hoyMontevideo } from '@/lib/masOperado/periodos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/plantillas-mensuales[?hoy=YYYY-MM-DD][&avisar=0]
 * Arma los borradores de fondos y bonos más comprados del mes (el de `hoy` si es
 * el último día del mes; si no, el anterior) y avisa (notificación + push) a
 * quienes publican Research. Lo dispara instrumentation.ts el último día del mes
 * (y el día 1 como respaldo); también sirve como gatillo manual (avisar=0:
 * solo crea los borradores). Idempotente. Bearer CRON_SECRET, igual que el resto.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const hoy = req.nextUrl.searchParams.get('hoy') ?? hoyMontevideo()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return NextResponse.json({ error: 'hoy inválido (YYYY-MM-DD)' }, { status: 400 })
  try {
    const resultados = await armarPlantillasMensuales(hoy, { avisar: req.nextUrl.searchParams.get('avisar') !== '0' })
    return NextResponse.json({ ok: true, resultados })
  } catch (err: any) {
    console.error('[cron/plantillas-mensuales] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
