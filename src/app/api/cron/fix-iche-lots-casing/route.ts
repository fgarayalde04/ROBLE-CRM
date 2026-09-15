import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Endpoint puntual — normaliza las claves de cada lote en iche_open_positions
// a camelCase (unitCost/tradeDate), que es lo que espera todo el código
// (Lot en types.ts). El seed inicial las guardó en snake_case
// (unit_cost/trade_date), lo que hacía que row.unitCost fuera undefined y
// quantity*undefined diera NaN → null al serializar a JSON, crasheando el
// preview. No cambia ningún valor (cantidad/costo/fecha quedan iguales),
// solo renombra las claves. A borrar apenas se use.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rows } = await pool.query(`select id, ticker, analyst, lots from iche_open_positions`)

  let fixedRows = 0
  let fixedLots = 0
  const details: any[] = []

  for (const row of rows) {
    const lots = row.lots as any[]
    let changed = false
    const normalized = lots.map(l => {
      const unitCost = l.unitCost !== undefined ? l.unitCost : l.unit_cost
      const tradeDate = l.tradeDate !== undefined ? l.tradeDate : (l.trade_date ?? null)
      if (l.unitCost === undefined || l.tradeDate === undefined) {
        changed = true
        fixedLots++
      }
      return { quantity: l.quantity, unitCost, tradeDate }
    })
    if (changed) {
      fixedRows++
      details.push({ ticker: row.ticker, analyst: row.analyst, before: lots, after: normalized })
      await pool.query(
        `update iche_open_positions set lots = $1::jsonb where id = $2`,
        [JSON.stringify(normalized), row.id]
      )
    }
  }

  return NextResponse.json({ totalPositions: rows.length, fixedRows, fixedLots, details })
}
