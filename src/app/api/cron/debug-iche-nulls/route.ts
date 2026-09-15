import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Endpoint puntual de diagnóstico — busca posiciones abiertas con algún lote
// sin quantity (null), causa del crash "Cannot read properties of null
// (reading 'toLocaleString')" en PreviewTables. A borrar apenas se use.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rows: allOpen } = await pool.query(`
    select id, analyst, ticker, description, source, lots, last_price, updated_at
    from iche_open_positions
    order by updated_at desc
  `)

  // Cualquier lote con algún campo null/faltante, no solo quantity.
  const suspect = allOpen.filter((p: any) =>
    p.lots.some((l: any) =>
      l.quantity == null || l.unitCost === undefined || l.unit_cost === undefined
        ? true
        : false
    ) || p.last_price == null
  )

  const { rows: recentUpdatedTogether } = await pool.query(`
    select updated_at, count(*) as n
    from iche_open_positions
    group by updated_at
    order by updated_at desc
    limit 5
  `)

  return NextResponse.json({
    totalOpen: allOpen.length,
    suspect,
    updateBatches: recentUpdatedTogether,
    sampleFirstThree: allOpen.slice(0, 3),
  })
}
