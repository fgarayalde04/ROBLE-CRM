/**
 * OpenFIGI API client — openFigiService
 * https://www.openfigi.com/api
 * Free tier: 25 req/min · 100 identifiers per request
 */

const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping'
const OPENFIGI_KEY = process.env.OPENFIGI_API_KEY ?? ''

export type FIGIIdType = 'ID_CUSIP' | 'ID_ISIN' | 'TICKER' | 'ID_COMMON'

export interface FIGIJob {
  idType:        FIGIIdType
  idValue:       string
  exchCode?:     string
  marketSecDes?: string
}

export interface FIGIResult {
  figi:           string
  name:           string
  ticker:         string
  exchCode:       string
  compositeFIGI:  string
  securityType:   string   // "Common Stock", "ETF", "Mutual Fund", "Corporate Bond" …
  marketSector:   string   // "Equity", "Fixed Income", "Money Mkt", "Commodity" …
  shareClassFIGI: string
  securityType2:  string
}

export interface FIGIResponse {
  data?:  FIGIResult[]
  error?: string
}

// ── Normalized asset descriptor returned by the service ──────────────────────

export interface NormalizedAsset {
  figi:           string | null
  normalizedName: string
  ticker:         string | null
  exchange:       string | null
  securityType:   string | null
  marketSector:   string | null
}

// ── Low-level batch mapping ───────────────────────────────────────────────────

export async function mapFIGI(jobs: FIGIJob[]): Promise<FIGIResponse[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (OPENFIGI_KEY) headers['X-OPENFIGI-APIKEY'] = OPENFIGI_KEY

  const res = await fetch(OPENFIGI_URL, {
    method:  'POST',
    headers,
    body:    JSON.stringify(jobs),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenFIGI ${res.status}: ${text}`)
  }
  return res.json()
}

// ── openFigiService — named functions per spec ────────────────────────────────

/** Look up by Security Identifier — auto-detects whether it is CUSIP or ISIN */
export async function lookupBySecurityIdentifier(
  identifier: string,
): Promise<FIGIResult | null> {
  const s = identifier.trim().toUpperCase()
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(s)) return lookupByIsin(s)
  if (/^[A-Z0-9]{9}$/.test(s))           return lookupByCusip(s)
  // Fallback: try as ticker
  return lookupByTicker(s)
}

export async function lookupByIsin(isin: string): Promise<FIGIResult | null> {
  return _singleLookup({ idType: 'ID_ISIN', idValue: isin.trim().toUpperCase() })
}

export async function lookupByCusip(cusip: string): Promise<FIGIResult | null> {
  return _singleLookup({ idType: 'ID_CUSIP', idValue: cusip.trim().toUpperCase() })
}

export async function lookupByTicker(
  symbol:    string,
  exchCode = 'US',
): Promise<FIGIResult | null> {
  return _singleLookup({ idType: 'TICKER', idValue: symbol.trim().toUpperCase(), exchCode })
}

/** Produce a normalised asset descriptor from a raw FIGIResult */
export function normalizeAsset(raw: FIGIResult): NormalizedAsset {
  return {
    figi:           raw.figi           || null,
    normalizedName: raw.name           || '',
    ticker:         raw.ticker         || null,
    exchange:       raw.exchCode       || null,
    securityType:   raw.securityType   || null,
    marketSector:   raw.marketSector   || null,
  }
}

// ── Original combined identifier lookup (kept for back-compat) ───────────────

export async function identifyInstrument(opts: {
  cusip?:  string
  isin?:   string
  ticker?: string
}): Promise<FIGIResult | null> {
  const jobs: FIGIJob[] = []
  if (opts.cusip)  jobs.push({ idType: 'ID_CUSIP', idValue: opts.cusip })
  if (opts.isin)   jobs.push({ idType: 'ID_ISIN',  idValue: opts.isin  })
  if (opts.ticker) jobs.push({ idType: 'TICKER',   idValue: opts.ticker, exchCode: 'US' })
  if (!jobs.length) return null
  try {
    const results = await mapFIGI(jobs)
    for (const r of results) {
      if (r.data?.length) return r.data[0]
    }
  } catch (e) {
    console.error('[openfigi] identifyInstrument error:', e)
  }
  return null
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function _singleLookup(job: FIGIJob): Promise<FIGIResult | null> {
  try {
    const results = await mapFIGI([job])
    return results[0]?.data?.[0] ?? null
  } catch (e) {
    console.error(`[openfigi] lookup error (${job.idType} ${job.idValue}):`, e)
    return null
  }
}
