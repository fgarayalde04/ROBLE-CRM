import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const valid = ['compra', 'venta', 'aumentar', 'reducir', 'mantener']
  const [funds, bonds, equities] = await Promise.all([
    pool.query(`select proposal_id, id, operacion, amount from proposal_funds where operacion is null or not (operacion = any($1))`, [valid]),
    pool.query(`select proposal_id, id, operacion, amount from proposal_bonds where operacion is null or not (operacion = any($1))`, [valid]),
    pool.query(`select proposal_id, id, operacion, amount from proposal_equities where operacion is null or not (operacion = any($1))`, [valid]),
  ])
  return NextResponse.json({
    fundsAnomalous: funds.rows,
    bondsAnomalous: bonds.rows,
    equitiesAnomalous: equities.rows,
  })
}
