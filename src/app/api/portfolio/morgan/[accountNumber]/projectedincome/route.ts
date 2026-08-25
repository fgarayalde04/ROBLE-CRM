import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseMorganProjectedIncomeExcel } from '@/lib/portfolio/morganProjectedIncomeParser'
import { resolveAccount, createCashProjectionsImport } from '@/lib/db/portfolio'

// POST /api/portfolio/morgan/[accountNumber]/projectedincome — upload Morgan
// Stanley's "ProjectedIncome.xlsx". Writes into the same
// portfolio_cash_projections_imports table Pershing's "Incoming Cash
// Projections" uses, tagged custodian='Morgan Stanley'.
export async function POST(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const account = await resolveAccount(accountNumber)
  const folderFilter = session.allowed_folders ?? null
  if (folderFilter && (!account.advisor || !folderFilter.includes(account.advisor))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = parseMorganProjectedIncomeExcel(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  // Este export no trae un campo "As Of" — igual que con Pershing, no se
  // bloquea la importación por eso, se usa hoy como fecha de referencia.
  if (!parsed.asOfDate) parsed.asOfDate = new Date().toISOString().slice(0, 10)

  try {
    const importRow = await createCashProjectionsImport({
      parsed,
      accountNumber,
      fileName: file.name,
      importedBy: session.name,
      importedById: session.id,
      custodian: 'Morgan Stanley',
    })
    return NextResponse.json({ ok: true, import: importRow, rows: parsed.rows, warnings: parsed.warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
