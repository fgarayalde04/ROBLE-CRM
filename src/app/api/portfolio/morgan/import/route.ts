import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import type { ParsedMorganHoldings } from '@/lib/portfolio/morganParser'
import { resolveAccount, findImportByAccountAndDate, deleteImport, createImport, createUnrealizedGainLossImport } from '@/lib/db/portfolio'

// POST /api/portfolio/morgan/import — confirm an import previewed via
// /api/portfolio/morgan/parse. Body: { parsed: ParsedMorganHoldings,
// accountNumber, fileName, replace? }
//
// Morgan Stanley's "Holdings - Cost Basis" export already carries both
// position data and per-lot cost basis / unrealized G/L in one file, so a
// single upload writes both portfolio_imports (custodian='Morgan Stanley')
// and portfolio_unrealized_gainloss_imports — unlike Pershing, which
// sometimes needs a second file for the same information.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { parsed: ParsedMorganHoldings; accountNumber?: string; fileName?: string; replace?: boolean }
  const { portfolio, unrealizedGL } = body.parsed ?? {}
  const accountNumber = (body.accountNumber ?? portfolio?.accountNumber)?.trim().toUpperCase()
  if (!accountNumber || !portfolio?.snapshotDate) {
    return NextResponse.json({ error: 'Datos de importación incompletos' }, { status: 400 })
  }
  portfolio.accountNumber = accountNumber

  const existing = await findImportByAccountAndDate(accountNumber, portfolio.snapshotDate, 'Morgan Stanley')
  if (existing && !body.replace) {
    return NextResponse.json({
      error: 'Ya existe un snapshot Morgan Stanley para esa cuenta y fecha',
      existingImport: { id: existing.id, createdAt: existing.created_at, positionCount: existing.position_count },
    }, { status: 409 })
  }
  if (existing && body.replace) {
    await deleteImport(existing.id)
  }

  const account = await resolveAccount(accountNumber)

  try {
    const importRow = await createImport({
      parsed: portfolio,
      accountNumber,
      clientNumber: account.clientNumber,
      clientName: account.clientName,
      advisor: account.advisor,
      fileName: body.fileName ?? 'holdings-cost-basis.xlsx',
      importedBy: session.name,
      importedById: session.id,
      custodian: 'Morgan Stanley',
    })

    let glImportRow = null
    if (unrealizedGL?.rows?.length) {
      glImportRow = await createUnrealizedGainLossImport({
        parsed: { ...unrealizedGL, asOfDate: unrealizedGL.asOfDate ?? portfolio.snapshotDate },
        accountNumber,
        fileName: body.fileName ?? 'holdings-cost-basis.xlsx',
        importedBy: session.name,
        importedById: session.id,
        custodian: 'Morgan Stanley',
      })
    }

    return NextResponse.json({ ok: true, import: importRow, glImport: glImportRow })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
