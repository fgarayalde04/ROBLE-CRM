import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Borra TODOS los movimientos de la planilla de Dividendos, en todas las
// cuentas — pedido explícito del usuario para volver a cargar todo de cero.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { rowCount } = await pool.query(`DELETE FROM portfolio_dividend_ledger`)
  return NextResponse.json({ ok: true, deleted: rowCount })
}
