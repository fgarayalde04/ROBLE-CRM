import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parsePerformancePdf } from '@/lib/portfolio/performancePdfParser'
import { resolveAccount, createPerformanceImport, getLatestPerformance } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/performance — latest reported performance (Pershing PDF).
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

  const performance = await getLatestPerformance(accountNumber)
  return NextResponse.json({ performance })
}

// POST /api/portfolio/[accountNumber]/performance — upload the Pershing
// "Portfolio Performance" PDF, extract real TWRR figures, save.
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

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsed
  try {
    parsed = await parsePerformancePdf(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el PDF: ' + err.message }, { status: 400 })
  }

  if (!parsed.reportDate) {
    return NextResponse.json({ error: 'No se pudo detectar la fecha del reporte en el PDF', warnings: parsed.warnings }, { status: 400 })
  }

  const warnings = [...parsed.warnings]
  if (parsed.accountLast4 && !accountNumber.endsWith(parsed.accountLast4)) {
    warnings.push(`El PDF menciona una cuenta terminada en ${parsed.accountLast4}, distinta de ${accountNumber} — se guardó igual en esta cuenta.`)
  }

  try {
    const importRow = await createPerformanceImport({
      parsed,
      accountNumber,
      fileName: file.name,
      importedBy: session.name,
      importedById: session.id,
    })
    return NextResponse.json({ ok: true, performance: importRow, warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
