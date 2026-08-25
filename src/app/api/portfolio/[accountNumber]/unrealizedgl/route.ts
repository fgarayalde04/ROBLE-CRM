import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseUnrealizedGainLossExcel } from '@/lib/portfolio/unrealizedGainLossParser'
import { resolveAccount, createUnrealizedGainLossImport, getLatestUnrealizedGainLoss } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/unrealizedgl — latest Cost Basis /
// Unrealized Gain-Loss per position. Optional ?custodian= scopes to that
// custodian's own data — omitted behaves exactly as before.
export async function GET(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const custodian = req.nextUrl.searchParams.get('custodian') || undefined
  const account = await resolveAccount(accountNumber)
  const folderFilter = session.allowed_folders ?? null
  if (folderFilter && (!account.advisor || !folderFilter.includes(account.advisor))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { importRow, rows } = await getLatestUnrealizedGainLoss(accountNumber, custodian)
  return NextResponse.json({ import: importRow, rows })
}

// POST /api/portfolio/[accountNumber]/unrealizedgl — upload the Unrealized
// Gain Loss Excel (real Cost Basis per tax lot, aggregated per security).
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
    parsed = parseUnrealizedGainLossExcel(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  if (!parsed.asOfDate) {
    return NextResponse.json({ error: 'No se pudo detectar la fecha ("As Of") en el archivo', warnings: parsed.warnings }, { status: 400 })
  }

  try {
    const importRow = await createUnrealizedGainLossImport({
      parsed,
      accountNumber,
      fileName: file.name,
      importedBy: session.name,
      importedById: session.id,
    })
    return NextResponse.json({ ok: true, import: importRow, rows: parsed.rows, warnings: parsed.warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
