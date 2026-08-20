import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listAccounts } from '@/lib/db/portfolio'

// GET /api/portfolio/accounts — one row per account (latest snapshot), scoped
// by advisor the same way /clients is (session.allowed_folders).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const folderFilter = session.allowed_folders ?? null
  const accounts = await listAccounts(folderFilter)
  return NextResponse.json(accounts)
}
