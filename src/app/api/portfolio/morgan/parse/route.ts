import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseMorganHoldingsExcel } from '@/lib/portfolio/morganParser'
import { resolveAccount, findImportByAccountAndDate } from '@/lib/db/portfolio'

// POST /api/portfolio/morgan/parse — upload a Morgan Stanley "Holdings - Cost
// Basis" Excel, parse it, return a preview. Does NOT write to the database —
// that only happens on /api/portfolio/morgan/import. Mirrors
// /api/portfolio/parse exactly, but for the Morgan Stanley format — kept as
// a separate route so the Pershing route has zero diff.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const accountNumberHint = (form.get('accountNumber') as string | null)?.trim().toUpperCase() || null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = parseMorganHoldingsExcel(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  // Este export nunca trae el número de cuenta completo — se usa el de
  // contexto (cuenta ya abierta) o se deja en null para completarlo a mano.
  if (accountNumberHint) parsed.portfolio.accountNumber = accountNumberHint

  const account = parsed.portfolio.accountNumber ? await resolveAccount(parsed.portfolio.accountNumber) : null
  const existing = parsed.portfolio.accountNumber && parsed.portfolio.snapshotDate
    ? await findImportByAccountAndDate(parsed.portfolio.accountNumber, parsed.portfolio.snapshotDate, 'Morgan Stanley')
    : null

  return NextResponse.json({
    parsed,
    account,
    existingImport: existing ? { id: existing.id, createdAt: existing.created_at, positionCount: existing.position_count, totalMarketValue: existing.total_market_value } : null,
    fileName: file.name,
  })
}
