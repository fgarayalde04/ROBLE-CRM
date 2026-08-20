import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { resolveAccount, getImportByDate, getPositions } from '@/lib/db/portfolio'

interface PosRow { id: string; isin: string | null; cusip: string | null; name: string; market_value: string; weight_pct: string | null }

function keyOf(p: PosRow): string {
  return p.isin || p.cusip || p.name.toLowerCase().trim()
}

// GET /api/portfolio/[accountNumber]/compare?from=YYYY-MM-DD&to=YYYY-MM-DD
// Diferencia de Market Value entre dos snapshots — explícitamente NO es
// rentabilidad (puede estar afectada por depósitos/retiros/compras/ventas).
export async function GET(
  req: NextRequest,
  { params }: { params: { accountNumber: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountNumber = decodeURIComponent(params.accountNumber)
  const from = req.nextUrl.searchParams.get('from')
  const to   = req.nextUrl.searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'Faltan los parámetros from/to' }, { status: 400 })

  const account = await resolveAccount(accountNumber)
  const folderFilter = session.allowed_folders ?? null
  if (folderFilter && (!account.advisor || !folderFilter.includes(account.advisor))) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const [importA, importB] = await Promise.all([
    getImportByDate(accountNumber, from),
    getImportByDate(accountNumber, to),
  ])
  if (!importA || !importB) return NextResponse.json({ error: 'No se encontró alguno de los dos snapshots' }, { status: 404 })

  const [posA, posB] = await Promise.all([getPositions(importA.id), getPositions(importB.id)])

  const mapA = new Map<string, PosRow>(posA.map((p: PosRow) => [keyOf(p), p]))
  const mapB = new Map<string, PosRow>(posB.map((p: PosRow) => [keyOf(p), p]))

  const nuevas: any[] = []
  const eliminadas: any[] = []
  const aumentaron: any[] = []
  const disminuyeron: any[] = []

  for (const [key, b] of Array.from(mapB)) {
    const a = mapA.get(key)
    if (!a) { nuevas.push({ name: b.name, marketValue: Number(b.market_value) }); continue }
    const diff = Number(b.market_value) - Number(a.market_value)
    if (Math.abs(diff) < 0.01) continue
    const entry = { name: b.name, from: Number(a.market_value), to: Number(b.market_value), diff }
    if (diff > 0) aumentaron.push(entry); else disminuyeron.push(entry)
  }
  for (const [key, a] of Array.from(mapA)) {
    if (!mapB.has(key)) eliminadas.push({ name: a.name, marketValue: Number(a.market_value) })
  }

  aumentaron.sort((a, b) => b.diff - a.diff)
  disminuyeron.sort((a, b) => a.diff - b.diff)

  return NextResponse.json({
    from: { date: importA.snapshot_date, totalMarketValue: Number(importA.total_market_value) },
    to:   { date: importB.snapshot_date, totalMarketValue: Number(importB.total_market_value) },
    diferencia: Number(importB.total_market_value) - Number(importA.total_market_value),
    nuevas, eliminadas, aumentaron, disminuyeron,
  })
}
