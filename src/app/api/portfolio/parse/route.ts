import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parsePortfolioExcel } from '@/lib/portfolio/parser'
import { resolveAccount, findImportByAccountAndDate } from '@/lib/db/portfolio'
import { completarDesdeUnrealized, esUnrealizedPershing } from '@/lib/portfolio/unrealizedCompleto'

// POST /api/portfolio/parse — upload an Excel, parse it, return a preview.
// Does NOT write to the database — that only happens on /api/portfolio/import.
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
    parsed = parsePortfolioExcel(buffer)
    // El Unrealized de Pershing alcanza solo: costo, fechas de compra, cupón,
    // vencimiento y cupón corrido salen del mismo archivo.
    if (esUnrealizedPershing(buffer)) parsed = completarDesdeUnrealized(buffer, parsed)
    // Los ETF van en renta variable.
    for (const p of parsed.positions) if (p.assetClass === 'ETF') p.assetClass = 'Equity'
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }

  // El número de cuenta no siempre está en el archivo (depende del formato del
  // export) — si no se detecta, se usa el de contexto (cuenta ya abierta) o
  // se deja en null para que se pueda completar a mano en la preview.
  if (!parsed.accountNumber && accountNumberHint) {
    parsed.accountNumber = accountNumberHint
  }

  // El número de cuenta no se pide: el asesor escribe el nombre del cliente.
  parsed.warnings = parsed.warnings.filter(w => !/número de cuenta/i.test(w))

  const account = parsed.accountNumber ? await resolveAccount(parsed.accountNumber) : null
  const existing = parsed.accountNumber && parsed.snapshotDate
    ? await findImportByAccountAndDate(parsed.accountNumber, parsed.snapshotDate)
    : null

  return NextResponse.json({
    parsed,
    account,
    existingImport: existing ? { id: existing.id, createdAt: existing.created_at, positionCount: existing.position_count, totalMarketValue: existing.total_market_value } : null,
    fileName: file.name,
  })
}
