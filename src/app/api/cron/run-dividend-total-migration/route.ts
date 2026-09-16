import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  await pool.query(`ALTER TABLE portfolio_dividend_ledger DROP CONSTRAINT IF EXISTS portfolio_dividend_ledger_entry_type_check`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD CONSTRAINT portfolio_dividend_ledger_entry_type_check CHECK (entry_type IN ('compra', 'dividendo', 'dividendo_total'))`)
  return NextResponse.json({ ok: true })
}
