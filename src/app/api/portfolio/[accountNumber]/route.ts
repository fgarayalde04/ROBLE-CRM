import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, getLatestImport, getImportByDate, getPositions } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber] — latest snapshot (or ?date=YYYY-MM-DD)
// with its positions, plus resolved account/client info.
export async function GET(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const date = req.nextUrl.searchParams.get('date')

  const account = await resolveAccount(accountNumber)

  const folderFilter = session.allowed_folders ?? null
  if (folderFilter && (!account.advisor || !folderFilter.includes(account.advisor))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const importRow = date
    ? await getImportByDate(accountNumber, date)
    : await getLatestImport(accountNumber)

  if (!importRow) {
    return NextResponse.json({ account, import: null, positions: [] })
  }

  const positions = await getPositions(importRow.id)
  return NextResponse.json({ account, import: importRow, positions })
}
