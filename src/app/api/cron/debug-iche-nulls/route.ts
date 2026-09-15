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

  const { rows } = await pool.query(`
    select id, analyst, ticker, description, source, lots, last_price, updated_at
    from iche_open_positions
    where exists (
      select 1 from jsonb_array_elements(lots) as lot
      where lot->'quantity' is null or lot->>'quantity' = 'null'
    )
    order by updated_at desc
  `)

  const { rows: recent } = await pool.query(`
    select id, analyst, ticker, description, source, lots, last_price, updated_at
    from iche_open_positions
    order by updated_at desc
    limit 10
  `)

  return NextResponse.json({ nullQuantityPositions: rows, mostRecentlyUpdated: recent })
}
