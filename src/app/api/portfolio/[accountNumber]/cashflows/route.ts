import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseCashProjectionsExcel } from '@/lib/portfolio/cashProjectionsParser'
import { resolveAccount, createCashProjectionsImport, getLatestCashProjections } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/cashflows — latest projected cash flows (Incoming Cash Projections Excel).
export async function GET(
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

  const { importRow, rows } = await getLatestCashProjections(accountNumber)
  return NextResponse.json({ import: importRow, rows })
}

// POST /api/portfolio/[accountNumber]/cashflows — upload the Incoming Cash
// Projections Excel, extract projected coupon/interest payments, save.
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
    parsed = parseCashProjectionsExcel(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  if (!parsed.asOfDate) {
    return NextResponse.json({ error: 'No se pudo detectar la fecha ("As of") en el archivo', warnings: parsed.warnings }, { status: 400 })
  }

  const warnings = [...parsed.warnings]
  if (parsed.accountNumber && parsed.accountNumber !== accountNumber) {
    warnings.push(`El archivo menciona la cuenta ${parsed.accountNumber}, distinta de ${accountNumber} — se guardó igual en esta cuenta.`)
  }

  try {
    const importRow = await createCashProjectionsImport({
      parsed,
      accountNumber,
      fileName: file.name,
      importedBy: session.name,
      importedById: session.id,
    })
    return NextResponse.json({ ok: true, import: importRow, rows: parsed.rows, warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
