import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPortfolioAccess } from '@/lib/auth'
import { resolveAccount, createActivityImport, getLatestActivity } from '@/lib/db/portfolio'
import { parseActivityExcel } from '@/lib/portfolio/activityParser'

// GET /api/portfolio/[accountNumber]/activity — últimos movimientos importados.
export async function GET(req: NextRequest, { params }: { params: { accountNumber: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const custodian = req.nextUrl.searchParams.get('custodian') || undefined
  const account = await resolveAccount(accountNumber)
  if (!hasPortfolioAccess(session, account)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }
  const { importRow, rows } = await getLatestActivity(accountNumber, custodian)
  return NextResponse.json({ import: importRow, rows })
}

// POST /api/portfolio/[accountNumber]/activity — subir el Excel de "Activity"
// del custodio.
export async function POST(req: NextRequest, { params }: { params: { accountNumber: string } }) {
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

  let parsed
  try {
    parsed = parseActivityExcel(await file.arrayBuffer())
  } catch (err: any) {
    return NextResponse.json({ error: 'No se pudo leer el archivo: ' + err.message }, { status: 400 })
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: parsed.warnings[0] ?? 'No se encontraron movimientos', warnings: parsed.warnings }, { status: 400 })
  }

  try {
    const importRow = await createActivityImport({
      parsed,
      accountNumber,
      fileName: file.name,
      importedBy: session.name,
      importedById: session.id,
      custodian: account.custodian ?? 'Pershing',
    })
    return NextResponse.json({ ok: true, import: importRow, count: parsed.rows.length, warnings: parsed.warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
