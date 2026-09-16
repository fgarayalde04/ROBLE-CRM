import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_dividend_ledger (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_number text NOT NULL,
      fund_name   text NOT NULL,
      entry_type  text NOT NULL CHECK (entry_type IN ('compra', 'dividendo')),
      entry_date  date,
      amount      numeric,
      notes       text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS portfolio_dividend_ledger_account_idx ON portfolio_dividend_ledger(account_number)`)
  return NextResponse.json({ ok: true })
}
