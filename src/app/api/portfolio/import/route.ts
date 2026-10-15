import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import type { ParsedPortfolioConGL } from '@/lib/portfolio/unrealizedCompleto'
import { resolveAccount, findImportByAccountAndDate, deleteImport, createImport, createUnrealizedGainLossImport } from '@/lib/db/portfolio'

// POST /api/portfolio/import — confirm an import previewed via /api/portfolio/parse.
// Body: { parsed: ParsedPortfolioImport, fileName: string, replace?: boolean, clientName?: string }
// Si el archivo era el Unrealized de Pershing, parsed.unrealizedGL trae el
// costo y las fechas de compra y se guardan en el mismo paso.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { parsed: ParsedPortfolioConGL; fileName?: string; replace?: boolean; clientName?: string | null }
  const parsed = body.parsed
  if (!parsed?.accountNumber || !parsed?.snapshotDate) {
    return NextResponse.json({ error: 'Datos de importación incompletos' }, { status: 400 })
  }

  const existing = await findImportByAccountAndDate(parsed.accountNumber, parsed.snapshotDate)
  if (existing && !body.replace) {
    return NextResponse.json({
      error: 'Ya existe un snapshot para esa cuenta y fecha',
      existingImport: { id: existing.id, createdAt: existing.created_at, positionCount: existing.position_count },
    }, { status: 409 })
  }
  if (existing && body.replace) {
    await deleteImport(existing.id)
  }

  const account = await resolveAccount(parsed.accountNumber)

  try {
    const importRow = await createImport({
      parsed,
      accountNumber: parsed.accountNumber,
      clientNumber:  account.clientNumber,
      clientName:    body.clientName?.trim() || account.clientName,
      advisor:       account.advisor,
      fileName:      body.fileName ?? 'positions.xlsx',
      importedBy:    session.name,
      importedById:  session.id,
    })
    const unrealizedGL = parsed.unrealizedGL
    if (unrealizedGL?.rows.length) {
      await createUnrealizedGainLossImport({
        parsed: { ...unrealizedGL, asOfDate: unrealizedGL.asOfDate ?? parsed.snapshotDate },
        accountNumber: parsed.accountNumber,
        fileName:      body.fileName ?? 'unrealized.xlsx',
        importedBy:    session.name,
        importedById:  session.id,
        custodian:     'Pershing',
      })
    }
    return NextResponse.json({ ok: true, import: importRow })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
