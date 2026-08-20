import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parsePortfolioExcel } from '@/lib/portfolio/parser'
import { resolveAccount, findImportByAccountAndDate } from '@/lib/db/portfolio'

// POST /api/portfolio/parse — upload an Excel, parse it, return a preview.
// Does NOT write to the database — that only happens on /api/portfolio/import.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = parsePortfolioExcel(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  if (!parsed.accountNumber) {
    return NextResponse.json({ error: 'No se pudo detectar el número de cuenta en el archivo', warnings: parsed.warnings }, { status: 400 })
  }

  const account = await resolveAccount(parsed.accountNumber)
  const existing = parsed.snapshotDate
    ? await findImportByAccountAndDate(parsed.accountNumber, parsed.snapshotDate)
    : null

  return NextResponse.json({
    parsed,
    account,
    existingImport: existing ? { id: existing.id, createdAt: existing.created_at, positionCount: existing.position_count, totalMarketValue: existing.total_market_value } : null,
    fileName: file.name,
  })
}
