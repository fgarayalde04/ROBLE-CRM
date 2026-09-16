import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS isin text`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS currency text`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS quantity numeric`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS price numeric`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS custodian text`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD COLUMN IF NOT EXISTS external_ref text`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger DROP CONSTRAINT IF EXISTS portfolio_dividend_ledger_entry_type_check`)
  await pool.query(`ALTER TABLE portfolio_dividend_ledger ADD CONSTRAINT portfolio_dividend_ledger_entry_type_check CHECK (entry_type IN ('compra', 'venta', 'dividendo', 'dividendo_total'))`)
  await pool.query(`CREATE INDEX IF NOT EXISTS portfolio_dividend_ledger_external_ref_idx ON portfolio_dividend_ledger(account_number, external_ref)`)
  return NextResponse.json({ ok: true })
}
