import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  await pool.query(`ALTER TABLE portfolio_positions_snapshot ADD COLUMN IF NOT EXISTS manual_dividend_received numeric`)
  return NextResponse.json({ ok: true })
}
