import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listImportHistory } from '@/lib/db/portfolio'

// GET /api/portfolio/imports — historial de importaciones (todas las cuentas
// del asesor, o filtrado por ?account=).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const folderFilter = session.allowed_folders ?? null
  const account = req.nextUrl.searchParams.get('account')
  const history = await listImportHistory(folderFilter, account)
  return NextResponse.json(history)
}
