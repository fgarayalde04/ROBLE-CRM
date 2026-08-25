import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, getLatestImport, getPositions, getLatestUnrealizedGainLoss, getLatestCashProjections } from '@/lib/db/portfolio'
import { consolidatePositions, consolidateUnrealizedGL, computeCustodianBreakdown } from '@/lib/portfolio/consolidationEngine'

// GET /api/portfolio/[accountNumber]/consolidated — merges this account's
// latest Pershing snapshot with its latest Morgan Stanley snapshot into one
// position-level view. Requires both custodians to have at least one
// imported snapshot; 404s otherwise (the UI should only offer this mode once
// /custodians confirms both exist).
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

  const [pershingImport, morganImport] = await Promise.all([
    getLatestImport(accountNumber, 'Pershing'),
    getLatestImport(accountNumber, 'Morgan Stanley'),
  ])
  if (!pershingImport || !morganImport) {
    return NextResponse.json({ error: 'Esta cuenta necesita un snapshot de ambos custodios para el modo Consolidado' }, { status: 404 })
  }

  const [pershingPositions, morganPositions, pershingGL, morganGL, pershingCash, morganCash] = await Promise.all([
    getPositions(pershingImport.id),
    getPositions(morganImport.id),
    getLatestUnrealizedGainLoss(accountNumber, 'Pershing'),
    getLatestUnrealizedGainLoss(accountNumber, 'Morgan Stanley'),
    getLatestCashProjections(accountNumber, 'Pershing'),
    getLatestCashProjections(accountNumber, 'Morgan Stanley'),
  ])

  const pershingTotal = Number(pershingImport.total_market_value)
  const morganTotal = Number(morganImport.total_market_value)
  const { positions, totalMarketValue, matchedCount } = consolidatePositions(pershingPositions, morganPositions, pershingTotal, morganTotal)
  const glByCusip = consolidateUnrealizedGL(pershingGL.rows, morganGL.rows)
  const custodianBreakdown = computeCustodianBreakdown(pershingTotal, morganTotal)

  const warnings: string[] = []
  if (pershingImport.snapshot_date !== morganImport.snapshot_date) {
    warnings.push(`Las fechas de valuación no coinciden: Pershing al ${pershingImport.snapshot_date}, Morgan Stanley al ${morganImport.snapshot_date}.`)
  }

  return NextResponse.json({
    account,
    pershingImport, morganImport,
    positions, totalMarketValue, matchedCount,
    glByCusip: Array.from(glByCusip.entries()),
    cashProjRows: [...pershingCash.rows, ...morganCash.rows],
    custodianBreakdown,
    warnings,
  })
}
