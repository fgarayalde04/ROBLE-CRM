// Consulta a Yahoo Finance (endpoints públicos, sin API key) del sector,
// industria y país de una acción. La búsqueda por ISIN/ticker no pide nada;
// el perfil (assetProfile) necesita la cookie de sesión y un "crumb", que se
// piden una vez y se reusan hasta que Yahoo los rechaza.

// Un User-Agent de navegador completo sin cookies recibe 429; el genérico no.
const UA = 'Mozilla/5.0'

let yahooSession: { cookie: string; crumb: string } | null = null

async function getSession(force = false) {
  if (yahooSession && !force) return yahooSession
  const res = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' })
  const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const cookie = setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ')
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumbRes.ok || !crumb || crumb.includes('<')) throw new Error(`Yahoo no devolvió crumb (${crumbRes.status})`)
  yahooSession = { cookie, crumb }
  return yahooSession
}

export interface YahooEquityInfo {
  symbol: string
  quoteType: string | null
  sector: string | null
  industria: string | null
  pais: string | null
}

/** Busca por ISIN (o ticker) y trae sector, industria y país. null si Yahoo no lo tiene. */
export async function lookupYahooEquity(query: string): Promise<YahooEquityInfo | null> {
  const q = query.trim()
  if (!q) return null
  const search = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=3&newsCount=0`,
    { headers: { 'User-Agent': UA } }
  )
  if (!search.ok) throw new Error(`Yahoo búsqueda ${search.status}`)
  const quotes: any[] = (await search.json())?.quotes ?? []
  const quote = quotes.find((x) => x.quoteType === 'EQUITY') ?? quotes.find((x) => x.quoteType === 'ETF') ?? quotes[0]
  if (!quote?.symbol) return null

  const info: YahooEquityInfo = {
    symbol: quote.symbol,
    quoteType: quote.quoteType ?? null,
    sector: quote.sector ?? null,
    industria: quote.industry ?? null,
    pais: null,
  }

  // Perfil: el país de la empresa (para los ADR es el país real, no EE.UU.).
  for (let intento = 0; intento < 2; intento++) {
    const { cookie, crumb } = await getSession(intento > 0)
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(quote.symbol)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`,
      { headers: { 'User-Agent': UA, Cookie: cookie } }
    )
    if (res.status === 401 || res.status === 403) continue   // crumb vencido: se pide otro
    if (!res.ok) break
    const profile = (await res.json())?.quoteSummary?.result?.[0]?.assetProfile
    if (profile) {
      info.pais = profile.country ?? null
      info.sector = info.sector ?? profile.sector ?? null
      info.industria = info.industria ?? profile.industry ?? null
    }
    break
  }
  return info
}
