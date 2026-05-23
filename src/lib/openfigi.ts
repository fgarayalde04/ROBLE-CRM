/**
 * OpenFIGI API client
 * https://www.openfigi.com/api
 * Free tier: 25 req/min · 100 identifiers per request
 */

const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping'
const OPENFIGI_KEY = process.env.OPENFIGI_API_KEY ?? ''

export type FIGIIdType =
  | 'ID_CUSIP'
  | 'ID_ISIN'
  | 'TICKER'
  | 'ID_COMMON'

export interface FIGIJob {
  idType: FIGIIdType
  idValue: string
  exchCode?: string
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

/**
 * Map a batch of identifiers via OpenFIGI.
 * Returns one FIGIResponse per input job (same order).
 */
export async function mapFIGI(jobs: FIGIJob[]): Promise<FIGIResponse[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (OPENFIGI_KEY) headers['X-OPENFIGI-APIKEY'] = OPENFIGI_KEY

  const res = await fetch(OPENFIGI_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(jobs),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenFIGI error ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Try to identify a single instrument by the best available identifier.
 * Priority: CUSIP → ISIN → TICKER → name (skipped, too unreliable)
 */
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
      if (r.data && r.data.length > 0) return r.data[0]
    }
  } catch (e) {
    console.error('[openfigi] identifyInstrument error:', e)
  }

  return null
}
