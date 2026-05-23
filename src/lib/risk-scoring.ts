/**
 * Risk scoring logic for Suitability / Portfolio Risk Monitor
 *
 * Scale 1-10:
 *  1  = cash / money market / treasury <1yr
 *  2  = investment grade short (<3yr)
 *  3  = treasury long / IG long
 *  4  = acciones defensivas / dividend equity
 *  5  = equity diversificado / S&P 500 / developed markets
 *  6  = high yield / small caps / REITs
 *  7  = growth / commodities / deuda emergente
 *  8  = EM equity / single stocks agresivas
 *  9  = crypto BTC / distressed / private equity
 * 10  = altcoins / penny stocks / leveraged
 */

import type { FIGIResult } from './openfigi'

export type RiskProfile = 'conservador' | 'moderado' | 'agresivo'
export type AssetClass =
  | 'cash'
  | 'fixed_income_ig'
  | 'fixed_income_hy'
  | 'equity_defensive'
  | 'equity_diversified'
  | 'equity_growth'
  | 'equity_emerging'
  | 'real_estate'
  | 'commodity'
  | 'crypto'
  | 'fund'
  | 'other'

// ─── Profile ranges ───────────────────────────────────────────────────────────

export const PROFILE_RANGES: Record<RiskProfile, { min: number; max: number }> = {
  conservador: { min: 1, max: 3.5 },
  moderado:    { min: 3.5, max: 6.5 },
  agresivo:    { min: 6.5, max: 10 },
}

export function scoreToProfile(score: number): RiskProfile {
  if (score <= PROFILE_RANGES.conservador.max) return 'conservador'
  if (score <= PROFILE_RANGES.moderado.max)    return 'moderado'
  return 'agresivo'
}

// ─── Asset class → default risk score ─────────────────────────────────────────

export const ASSET_CLASS_DEFAULT_SCORE: Record<AssetClass, number> = {
  cash:               1,
  fixed_income_ig:    2,
  fixed_income_hy:    6,
  equity_defensive:   4,
  equity_diversified: 5,
  equity_growth:      7,
  equity_emerging:    8,
  real_estate:        6,
  commodity:          7,
  crypto:             9,
  fund:               5,
  other:              5,
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  cash:               'Cash / Money Market',
  fixed_income_ig:    'Renta Fija IG',
  fixed_income_hy:    'Renta Fija HY',
  equity_defensive:   'Acciones Defensivas',
  equity_diversified: 'Equity Diversificado',
  equity_growth:      'Equity Growth',
  equity_emerging:    'Equity Emergente',
  real_estate:        'Real Estate / REIT',
  commodity:          'Commodities',
  crypto:             'Cripto',
  fund:               'Fondo',
  other:              'Otro',
}

// ─── Derive asset class from OpenFIGI response ─────────────────────────────────

/** Keywords that hint at a specific asset class inside ETF/fund names */
const ETF_NAME_RULES: Array<{ pattern: RegExp; assetClass: AssetClass }> = [
  { pattern: /\b(cash|money.?market|treasury.?bill|t.?bill|mmf)\b/i, assetClass: 'cash' },
  { pattern: /\b(short.?term|ultra.?short|1.?3.?yr|1.?3.?year)\b/i, assetClass: 'fixed_income_ig' },
  { pattern: /\b(aggregate|agg|bond|invest.?grade|investment.?grade|IG|tips|treasury|govt|government)\b/i, assetClass: 'fixed_income_ig' },
  { pattern: /\b(high.?yield|HY|junk|below.?invest)\b/i,             assetClass: 'fixed_income_hy' },
  { pattern: /\b(dividend|utilities|consumer.?staple|low.?vol|minimum.?vol)\b/i, assetClass: 'equity_defensive' },
  { pattern: /\b(S&P.?500|sp500|world|msci|total.?market|developed|vti|vea|eafe)\b/i, assetClass: 'equity_diversified' },
  { pattern: /\b(growth|nasdaq|tech|technology|innovation|cloud|semi|software)\b/i, assetClass: 'equity_growth' },
  { pattern: /\b(emerg|EM |EEM|VWO|developing|china|india|latam|brazil)\b/i, assetClass: 'equity_emerging' },
  { pattern: /\b(real.?estate|reit|REIT|property)\b/i,               assetClass: 'real_estate' },
  { pattern: /\b(gold|silver|oil|commodity|commodit|DBC|GLD|IAU|SLV)\b/i, assetClass: 'commodity' },
  { pattern: /\b(bitcoin|ethereum|crypto|BTC|ETH)\b/i,               assetClass: 'crypto' },
]

function classifyByName(name: string): AssetClass {
  for (const rule of ETF_NAME_RULES) {
    if (rule.pattern.test(name)) return rule.assetClass
  }
  return 'other'
}

/**
 * Derive asset class + risk score from OpenFIGI data.
 * Returns null if we can't determine (mark as pending).
 */
export function scoreFromFIGI(figi: FIGIResult): { assetClass: AssetClass; riskScore: number; category: string } | null {
  const sector = figi.marketSector?.toLowerCase() ?? ''
  const type   = figi.securityType?.toLowerCase() ?? ''
  const type2  = figi.securityType2?.toLowerCase() ?? ''
  const name   = figi.name ?? ''

  // Money market
  if (sector === 'money mkt' || type.includes('money market')) {
    return { assetClass: 'cash', riskScore: 1, category: 'Money Market' }
  }

  // Fixed income
  if (sector === 'fixed income' || type.includes('bond') || type.includes('note')) {
    if (type.includes('government') || type.includes('treasury') || type.includes('us govt')) {
      return { assetClass: 'fixed_income_ig', riskScore: 3, category: 'Government Bond' }
    }
    if (type.includes('corporate') || type.includes('corp')) {
      // Can't distinguish IG vs HY without more data → default IG, mark for review
      return { assetClass: 'fixed_income_ig', riskScore: 3, category: 'Corporate Bond' }
    }
    if (type.includes('municipal') || type.includes('muni')) {
      return { assetClass: 'fixed_income_ig', riskScore: 2, category: 'Municipal Bond' }
    }
    return { assetClass: 'fixed_income_ig', riskScore: 3, category: 'Fixed Income' }
  }

  // ETF or mutual fund — classify by name
  if (type.includes('etf') || type2.includes('etf') || type.includes('mutual fund') || type.includes('open-end fund')) {
    const ac = classifyByName(name)
    return { assetClass: ac, riskScore: ASSET_CLASS_DEFAULT_SCORE[ac], category: 'ETF / Fund' }
  }

  // Common stock / equity
  if (sector === 'equity' || type.includes('common stock') || type.includes('ordinary')) {
    // Try to distinguish defensive vs growth by name
    if (/utilities|staple|consumer|pharma|health|insurance|bank|finance/i.test(name)) {
      return { assetClass: 'equity_defensive', riskScore: 4, category: 'Acciones Defensivas' }
    }
    if (/tech|software|cloud|ai |semi|internet|bio|growth/i.test(name)) {
      return { assetClass: 'equity_growth', riskScore: 7, category: 'Acciones Growth' }
    }
    return { assetClass: 'equity_diversified', riskScore: 5, category: 'Acciones' }
  }

  // Commodity
  if (sector === 'commodity' || type.includes('commodity')) {
    return { assetClass: 'commodity', riskScore: 7, category: 'Commodity' }
  }

  return null
}

// ─── Portfolio calculation ────────────────────────────────────────────────────

export interface ScoredPosition {
  raw_name:      string
  market_value:  number
  weight:        number
  risk_score:    number | null
  asset_class:   string | null
  classification_status: 'classified' | 'pending' | 'manual'
}

export function calculatePortfolioScore(positions: ScoredPosition[]): {
  score: number
  profile: RiskProfile
  classified_weight: number
  pending_weight:    number
  top_risk:          ScoredPosition[]
} {
  let weightedScore = 0
  let classifiedWeight = 0
  let pendingWeight = 0

  for (const p of positions) {
    if (p.risk_score != null && p.weight != null) {
      weightedScore    += (p.weight / 100) * p.risk_score
      classifiedWeight += p.weight
    } else {
      pendingWeight += p.weight ?? 0
    }
  }

  // Re-scale to 100% classified
  const score = classifiedWeight > 0
    ? weightedScore / (classifiedWeight / 100)
    : 0

  const profile = scoreToProfile(score)

  // Top risk contributors
  const top_risk = [...positions]
    .filter(p => p.risk_score != null)
    .sort((a, b) => ((b.risk_score ?? 0) * (b.weight ?? 0)) - ((a.risk_score ?? 0) * (a.weight ?? 0)))
    .slice(0, 5)

  return { score, profile, classified_weight: classifiedWeight, pending_weight: pendingWeight, top_risk }
}

export function generateExplanation(
  portfolioScore: number,
  portfolioProfile: RiskProfile,
  clientProfile: RiskProfile,
  aligned: boolean,
  pendingWeight: number,
): string {
  const scoreStr = portfolioScore.toFixed(2)
  const profileLabels: Record<RiskProfile, string> = {
    conservador: 'Conservador',
    moderado:    'Moderado',
    agresivo:    'Agresivo',
  }

  let text = `La cartera obtuvo un score de riesgo de ${scoreStr}/10, correspondiente a un perfil ${profileLabels[portfolioProfile]}. `
  text += `El perfil declarado del cliente es ${profileLabels[clientProfile]}. `

  if (aligned) {
    text += 'La cartera está alineada con el perfil del cliente.'
  } else {
    if (portfolioProfile === 'agresivo' && clientProfile !== 'agresivo') {
      text += 'La cartera tiene un nivel de riesgo superior al perfil declarado. Se recomienda revisar las posiciones de mayor riesgo.'
    } else if (portfolioProfile === 'conservador' && clientProfile !== 'conservador') {
      text += 'La cartera es más conservadora que el perfil declarado. Puede no estar maximizando el potencial de retorno.'
    } else {
      text += 'Existe una discrepancia entre el riesgo de la cartera y el perfil declarado del cliente.'
    }
  }

  if (pendingWeight > 10) {
    text += ` Nota: el ${pendingWeight.toFixed(1)}% de la cartera (por peso) está pendiente de clasificación y no fue incluido en el cálculo.`
  }

  return text
}
