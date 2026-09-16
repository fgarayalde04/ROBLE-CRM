import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPortfolioAccess } from '@/lib/auth'
import { resolveAccount, createDividendLedgerEntry, findExistingExternalRefs } from '@/lib/db/portfolio'
import { fundGroupKey, buildExternalRef } from '@/lib/portfolio/dividendEngine'

interface ImportRow {
  date: string | null
  fundName: string
  isin: string | null
  type: 'compra' | 'venta' | 'dividendo'
  amount: number | null
  quantity: number | null
  price: number | null
  currency: string | null
  custodian: string | null
}

// POST /api/portfolio/[accountNumber]/dividends/import — incorpora las
// filas que el asesor confirmó en el preview (después de editar/sacar lo
// que no correspondía). Vuelve a chequear duplicados contra lo que ya hay
// en la base al momento de confirmar, por si cambió algo desde que se
// generó el preview.
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

  const body = await req.json() as { rows?: ImportRow[] }
  const rows = body.rows ?? []
  if (rows.length === 0) return NextResponse.json({ error: 'Nada para importar' }, { status: 400 })

  const withRefs = rows.map(r => ({
    row: r,
    externalRef: buildExternalRef({ fundKey: fundGroupKey(r.isin, r.fundName), date: r.date, type: r.type, amount: r.amount, currency: r.currency, account: accountNumber }),
  }))
  const alreadyExisting = await findExistingExternalRefs(accountNumber, withRefs.map(w => w.externalRef))

  let imported = 0
  let skippedDuplicates = 0
  const seenInBatch = new Set<string>()
  for (const { row, externalRef } of withRefs) {
    if (alreadyExisting.has(externalRef) || seenInBatch.has(externalRef)) { skippedDuplicates++; continue }
    seenInBatch.add(externalRef)
    if (!row.fundName?.trim() || !row.type) continue
    await createDividendLedgerEntry({
      accountNumber,
      fundName: row.fundName.trim(),
      entryType: row.type,
      entryDate: row.date,
      amount: row.amount,
      notes: null,
      createdBy: session.id ?? null,
      isin: row.isin,
      currency: row.currency,
      quantity: row.quantity,
      price: row.price,
      custodian: row.custodian,
      source: 'activity_import',
      externalRef,
    })
    imported++
  }

  return NextResponse.json({ ok: true, imported, skippedDuplicates })
}
