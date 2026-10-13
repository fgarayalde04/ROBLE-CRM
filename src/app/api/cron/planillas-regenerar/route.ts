import { NextRequest, NextResponse } from 'next/server'
import { regeneratePlanilla } from '@/lib/planillas/regenerate'
import { PLANILLA_BOOKS } from '@/lib/planillas/settings'
import type { PositionsBook } from '@/lib/icheAcciones/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/planillas-regenerar[?book=iche|albojer]
 * Gatillo manual/interno para redibujar las planillas con los datos actuales
 * (sin archivos nuevos). Exige Bearer CRON_SECRET; sin CRON_SECRET configurado
 * no corre (escribe en OneDrive y en la base).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const only = req.nextUrl.searchParams.get('book')
  const books = (only ? [only] : PLANILLA_BOOKS).filter((b): b is PositionsBook => PLANILLA_BOOKS.includes(b as PositionsBook))
  if (books.length === 0) return NextResponse.json({ error: 'book inválido' }, { status: 400 })
  try {
    const resultados = []
    for (const b of books) resultados.push(await regeneratePlanilla(b))
    return NextResponse.json({ ok: true, resultados })
  } catch (err: any) {
    console.error('[cron/planillas-regenerar] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
