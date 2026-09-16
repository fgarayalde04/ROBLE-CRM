import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPortfolioAccess } from '@/lib/auth'
import { resolveAccount, listDividendLedger } from '@/lib/db/portfolio'
import { parseDividendActivityExcel } from '@/lib/portfolio/dividendActivityParser'
import { fundGroupKey, buildExternalRef } from '@/lib/portfolio/dividendEngine'

// POST /api/portfolio/[accountNumber]/dividends/parse — sube un Activity
// (.xlsx/.xls/.csv), lo interpreta y devuelve el preview SIN guardar nada
// todavía; cada fila detectada trae si ya existe en la planilla (posible
// duplicado), para que el asesor confirme/edite antes de incorporar.
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

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const isCsv = file.name.toLowerCase().endsWith('.csv')
  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = parseDividendActivityExcel(buffer, isCsv)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: parsed.warnings[0] ?? 'No se encontraron movimientos', warnings: parsed.warnings }, { status: 400 })
  }

  const existing = await listDividendLedger(accountNumber)
  const existingRefs = new Set(existing.map(e => e.external_ref).filter(Boolean))

  const rowsWithRefs = parsed.rows.map(r => ({
    r,
    externalRef: buildExternalRef({ fundKey: fundGroupKey(r.isin, r.fundName), date: r.date, type: r.type!, amount: r.amount, currency: r.currency }),
  }))
  // Chequea también contra otras filas del MISMO archivo (el mismo Activity
  // puede traer la misma línea repetida en distintas hojas, por ejemplo).
  const refsInThisFile = new Set<string>()
  const preview = rowsWithRefs.map(({ r, externalRef }) => {
    const isDuplicate = existingRefs.has(externalRef) || refsInThisFile.has(externalRef)
    refsInThisFile.add(externalRef)
    return {
      date: r.date,
      fundName: r.fundName,
      isin: r.isin,
      type: r.type,
      amount: r.amount,
      quantity: r.quantity,
      price: r.price,
      currency: r.currency,
      custodian: r.custodian,
      externalRef,
      isDuplicate,
    }
  })

  return NextResponse.json({
    rows: preview,
    ignoredCount: parsed.ignoredCount,
    warnings: parsed.warnings,
  })
}
