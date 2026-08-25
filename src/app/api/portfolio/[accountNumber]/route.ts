import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, getLatestImport, getImportByDate, getPositions, deletePortfolioAccount } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber] — latest snapshot (or ?date=YYYY-MM-DD)
// with its positions, plus resolved account/client info. Optional
// ?custodian=Pershing|Morgan Stanley scopes to that custodian's own snapshot
// — omitted (today's only caller) behaves exactly as before.
export async function GET(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const date = req.nextUrl.searchParams.get('date')
  const custodian = req.nextUrl.searchParams.get('custodian') || undefined

  const account = await resolveAccount(accountNumber)

  const folderFilter = session.allowed_folders ?? null
  if (folderFilter && (!account.advisor || !folderFilter.includes(account.advisor))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const importRow = date
    ? await getImportByDate(accountNumber, date, custodian)
    : await getLatestImport(accountNumber, custodian)

  if (!importRow) {
    return NextResponse.json({ account, import: null, positions: [] })
  }

  const positions = await getPositions(importRow.id)
  return NextResponse.json({ account, import: importRow, positions })
}

// DELETE /api/portfolio/[accountNumber] — wipes every portfolio import for
// this account (positions, cash projections, performance, unrealized G/L).
// Irreversible. Admin-only.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins pueden eliminar un portafolio' }, { status: 403 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  await deletePortfolioAccount(accountNumber)
  return NextResponse.json({ ok: true })
}
