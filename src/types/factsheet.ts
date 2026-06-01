// ── Factsheet data types ──────────────────────────────────────────────────────

export interface FactsheetPosition {
  symbol:        string
  name:          string
  securityType:  string
  assetClass:    string   // Cash | Fixed Income | Equity | ETF | Mutual Fund | Alternatives | Real Estate
  sector:        string
  region:        string   // USA | Europe | LatAm | Emerging Markets | Asia | Global
  currency:      string
  quantity:      number | null
  marketValue:   number
  weight:        number   // % of total
  costBasis:     number | null
  unrealizedGL:  number | null
  returnPct:     number | null
  riskScore:     number | null
}

export interface AllocationItem {
  name:  string
  value: number
  pct:   number
  color: string
}

export interface FactsheetAllocation {
  byAssetClass: AllocationItem[]
  bySector:     AllocationItem[]
  byRegion:     AllocationItem[]
  byCurrency:   AllocationItem[]
}

export interface HistoricalReturn {
  period:     string
  portfolio:  number
  benchmark?: number
}

export interface FactsheetPerformance {
  ytdReturn?:       number   // YTD
  return1y?:        number   // 1 año anualizado
  return3y?:        number   // 3 años anualizado
  return5y?:        number   // 5 años anualizado
  inceptionReturn?: number   // Desde inicio (acumulado)
  history:          HistoricalReturn[]
}

export interface FactsheetMeta {
  clientName:    string
  reportDate:    string
  advisor:       string
  quarter:       string
  accountNumber: string
  benchmark:     string
  currency:      string
}

export interface FactsheetCommentary {
  marketCommentary: string
  outlook:          string
  strategy:         string
  portfolioChanges: string
  recommendations:  string
}

export interface FactsheetData {
  id?:          string
  meta:         FactsheetMeta
  positions:    FactsheetPosition[]
  totalValue:   number
  allocation:   FactsheetAllocation
  performance:  FactsheetPerformance
  commentary:   FactsheetCommentary
  disclaimer:   string
  riskScore:    number | null
  riskProfile:  string
  createdAt?:   string
}

// ── Parse result from Excel ───────────────────────────────────────────────────

export interface ParsedFactsheet {
  meta:       Partial<FactsheetMeta>
  positions:  FactsheetPosition[]
  totalValue: number
  warnings:   string[]
}
