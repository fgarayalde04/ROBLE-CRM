import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPortfolioAccess } from '@/lib/auth'
import { resolveAccount, listDividendLedger, createDividendLedgerEntry } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/dividends — planilla manual de compras y
// dividendos cobrados por fondo (nunca se completa sola, es 100% a mano).
export async function GET(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const account = await resolveAccount(accountNumber)
  if (!hasPortfolioAccess(session, account)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const entries = await listDividendLedger(accountNumber)
  return NextResponse.json({ entries })
}

// POST /api/portfolio/[accountNumber]/dividends — agrega una fila (compra o
// dividendo cobrado) para un fondo.
export async function POST(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const account = await resolveAccount(accountNumber)
  if (!hasPortfolioAccess(session, account)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json() as { fund_name?: string; entry_type?: string; entry_date?: string | null; amount?: number | null; notes?: string | null }
  const fundName = body.fund_name?.trim()
  if (!fundName) return NextResponse.json({ error: 'Falta el nombre del fondo' }, { status: 400 })
  if (!body.entry_type || !['compra', 'dividendo', 'dividendo_total'].includes(body.entry_type)) {
    return NextResponse.json({ error: 'entry_type debe ser "compra", "dividendo" o "dividendo_total"' }, { status: 400 })
  }

  const entry = await createDividendLedgerEntry({
    accountNumber,
    fundName,
    entryType: body.entry_type as 'compra' | 'dividendo' | 'dividendo_total',
    entryDate: body.entry_date?.trim() || null,
    amount: body.amount ?? null,
    notes: body.notes?.trim() || null,
    createdBy: session.id ?? null,
  })
  return NextResponse.json({ ok: true, entry })
}
