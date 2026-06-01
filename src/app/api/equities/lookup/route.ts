import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase().trim()
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    // Yahoo Finance quoteSummary — assetProfile (sector, country) + quoteType (longName)
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile%2CquoteType`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const json = await res.json()

    const result     = json?.quoteSummary?.result?.[0]
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const profile    = result.assetProfile  ?? {}
    const quoteType  = result.quoteType     ?? {}

    const company = quoteType.longName  || quoteType.shortName || null
    const sector  = profile.sector      || null
    const country = profile.country     || null

    return NextResponse.json({ ticker, company, sector, country })
  } catch {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
}
