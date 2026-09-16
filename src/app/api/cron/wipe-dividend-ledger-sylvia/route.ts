import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Borra los movimientos de la planilla de Dividendos únicamente para la(s)
// cuenta(s) cuyo cliente coincide con "Sylvia" — pedido explícito del
// usuario, acotado después de confirmar que no era para todas las cuentas.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rows: matches } = await pool.query(`
    select distinct pi.account_number, coalesce(nullif(pi.client_name, ''), nullif(mba.account_name, '')) as client_name
    from portfolio_imports pi
    left join monitoring_base_accounts mba on mba.account_number = pi.account_number
    where pi.client_name ilike '%sylvia%' or mba.account_name ilike '%sylvia%'
  `)

  if (matches.length === 0) {
    return NextResponse.json({ ok: false, error: 'No se encontró ninguna cuenta de Portafolio con "Sylvia" en el nombre', matches: [] })
  }

  const accountNumbers = matches.map(m => m.account_number)
  const { rowCount } = await pool.query(
    `delete from portfolio_dividend_ledger where account_number = any($1)`,
    [accountNumbers]
  )
  return NextResponse.json({ ok: true, matches, deleted: rowCount })
}
