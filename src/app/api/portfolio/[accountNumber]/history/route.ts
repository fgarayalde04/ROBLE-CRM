import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, listSnapshotDates } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/history — snapshot dates + total market
// value, for the "Evolución del valor de mercado" chart.
export async function GET(
  _req: NextRequest,
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

  const snapshots = await listSnapshotDates(accountNumber)
  return NextResponse.json(snapshots)
}
