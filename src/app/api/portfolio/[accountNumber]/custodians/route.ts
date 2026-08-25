import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, listCustodiansForAccount } from '@/lib/db/portfolio'

// GET /api/portfolio/[accountNumber]/custodians — one row per custodian ever
// imported for this account. Powers the custodian switcher: it only renders
// when this returns more than one, so an account that only ever had
// Pershing data never shows any new UI.
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

  const custodians = await listCustodiansForAccount(accountNumber)
  return NextResponse.json({ custodians })
}
