/**
 * Risk scoring v2 — criterial engine: tipo × geografía × crédito × complejidad
 *
 * Escala 1-10:
 *  1    Cash / Money Market / T-Bill
 *  2-3  Renta Fija soberana mercados desarrollados
 *  3-4  Renta Fija corporativa Investment Grade
 *  5    ETF diversificado (S&P 500 / MSCI World) | Activos defensivos
 *  6    Corp IG EM/LatAm | High Yield desarrollado | Preferred | REIT | ETF ex-US
 *  7    Equity desarrollado | ETF Growth/Tech | HY/EM bonds | Commodities
 *  8    Equity EM/LatAm | Soberano EM/LatAm | ETF sectorial/EM
 *  9    Equity Argentina | Soberano Argentina | Distressed | Opciones
 *  10   ETF Apalancado/Inverso | Estructurados de alto riesgo
 */

import type { FIGIResult } from './openfigi'

// ── Public types ──────────────────────────────────────────────────────────────

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
  | 'structured'
  | 'derivatives'
  | 'other'

/** Returned by scoreFromFIGI and scoreFallback */
export interface ScoringResult {
  assetClass:  AssetClass
  riskScore:   number
  category:    string
  explanation: string
}

// ── Profile configuration ─────────────────────────────────────────────────────

export const PROFILE_RANGES: Record<RiskProfile, { min: number; max: number }> = {
  conservador: { min: 1, max: 3  },
  moderado:    { min: 3, max: 6  },
  agresivo:    { min: 6, max: 10 },
}

export function scoreToProfile(score: number): RiskProfile {
  if (score <= 3) return 'conservador'
  if (score <= 6) return 'moderado'
  return 'agresivo'
}

export const ASSET_CLASS_DEFAULT_SCORE: Record<AssetClass, number> = {
  cash:               1,
  fixed_income_ig:    3,
  fixed_income_hy:    6,
  equity_defensive:   5,
  equity_diversified: 7,
  equity_growth:      7,
  equity_emerging:    8,
  real_estate:        6,
  commodity:          7,
  crypto:             9,
  fund:               5,
  structured:         8,
  derivatives:        9,
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
  structured:         'Producto Estructurado',
  derivatives:        'Opciones / Derivados',
  other:              'Otro',
}

// ── Internal criteria types ───────────────────────────────────────────────────

type GeoRisk      = 'developed' | 'latam' | 'argentina' | 'em' | 'frontier'
type CreditQuality = 'ig' | 'hy' | 'distressed' | 'unknown'
type Complexity   = 'leveraged' | 'inverse' | 'structured' | 'plain'

// ── Geo / credit / complexity detection ──────────────────────────────────────

function detectGeo(text: string, exchCode?: string): GeoRisk {
  const t = text.toLowerCase()
  const e = (exchCode ?? '').toUpperCase()

  // Argentina — keywords + known issuers (sin \b final para capturar "argentina", "argentine", "argentino")
  if (
    /argentin|ggal\b|galicia\b|\bypf\b|arcor\b|pampa\b|edenor\b|supervielle|cablevision\b|cresud\b|irsa\b|aluar\b|merval\b|bcba\b|loma\s+negra|ternium\s+arg|grupo\s+galicia|banco\s+macro/i.test(t) ||
    /\barg\b/i.test(t) ||
    e === 'XBUE'
  ) return 'argentina'

  // LatAm — keywords + known issuers (mexic cubre mexico/mexicanos/mexicana)
  if (
    /brazil|brasil|mexic|colombia|peru\b|chile\b|uruguay|paraguay|latin.?am|latam|\bvale\b|petrobras|cosan\b|\bitau\b|bradesco|pemex|petroleos\s+mexic|cemex\b|femsa\b|\bogx\b|homex\b|desarrolladora\s+homex/i.test(t) ||
    /^(BVMF|BVSP|XBOG|XLIM|XSGO|XMEX|XCAR)/.test(e)
  ) return 'latam'

  if (/\b(frontier|kenya|ghana|zambia|bangladesh|sri.?lanka)\b/i.test(t)) return 'frontier'

  if (
    /\b(emerg|china|india\b|turkey|russia|indonesia|vietnam|egypt|pakistan|south.?africa|saudi|qatar|uae|nigeria|korea|taiwan)\b/i.test(t)
  ) return 'em'

  return 'developed'
}

function detectCredit(text: string): CreditQuality {
  const t = text.toLowerCase()
  if (/\b(distressed|default\b|bankrupt|recovery|workout)\b/i.test(t))        return 'distressed'
  if (/\b(high.?yield|\bhy\b|junk|sub.?investment.?grade|speculative)\b/i.test(t)) return 'hy'
  if (/\b(investment.?grade|\big\b|aaa\b|aa\b|triple.?a|double.?a|t.?bill|treasury|us.?gov)\b/i.test(t)) return 'ig'
  return 'unknown'
}

function detectComplexity(text: string): Complexity {
  const t = text.toLowerCase()
  if (/\b(2x|3x|4x|ultra.?long|ultra.?short|leverag|apalancad)\b/i.test(t))  return 'leveraged'
  if (/\b(inverse|inverso|short.?etf|\-[123]x)\b/i.test(t))                  return 'inverse'
  if (/\b(structured|barrier|autocall|principal.?at.?risk|capital.?protected|note.?at.?risk)\b/i.test(t))
    return 'structured'
  return 'plain'
}

function geoLabel(geo: GeoRisk): string {
  const map: Record<GeoRisk, string> = {
    developed: 'mercado desarrollado',
    latam:     'LatAm',
    argentina: 'Argentina',
    em:        'mercado emergente',
    frontier:  'mercado frontera',
  }
  return map[geo]
}

// ── Known ETF ticker table ────────────────────────────────────────────────────

const KNOWN_ETF_TICKERS: Record<string, Omit<ScoringResult, 'explanation'>> = {
  // ── US broad market ──────────────────────────────────────────────────────────
  SPY:  { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF S&P 500' },
  IVV:  { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF S&P 500' },
  VOO:  { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF S&P 500' },
  VTI:  { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF US Total Market' },
  ITOT: { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF US Total Market' },
  SCHB: { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF US Market' },
  SPTM: { riskScore: 5, assetClass: 'equity_diversified', category: 'ETF US Total Market' },
  // ── Growth / Tech ─────────────────────────────────────────────────────────────
  QQQ:  { riskScore: 7, assetClass: 'equity_growth', category: 'ETF Nasdaq 100' },
  QQQM: { riskScore: 7, assetClass: 'equity_growth', category: 'ETF Nasdaq 100' },
  VGT:  { riskScore: 7, assetClass: 'equity_growth', category: 'ETF Tech' },
  XLK:  { riskScore: 7, assetClass: 'equity_growth', category: 'ETF Sector Tech' },
  FTEC: { riskScore: 7, assetClass: 'equity_growth', category: 'ETF Tech' },
  ARKK: { riskScore: 9, assetClass: 'equity_growth', category: 'ETF Innovación Especulativo' },
  ARKG: { riskScore: 9, assetClass: 'equity_growth', category: 'ETF Biotecnología Especulativo' },
  // ── Developed ex-US ──────────────────────────────────────────────────────────
  VEA:  { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF Desarrollados ex-US' },
  EFA:  { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF MSCI EAFE' },
  VEU:  { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF World ex-US' },
  SCHF: { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF Mercados Desarrollados' },
  EWJ:  { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF Japón' },
  // ── Emerging markets ─────────────────────────────────────────────────────────
  EEM:  { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Mercados Emergentes' },
  VWO:  { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Mercados Emergentes' },
  IEMG: { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Mercados Emergentes' },
  EWZ:  { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Brasil' },
  MCHI: { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF China' },
  INDA: { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF India' },
  EWT:  { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Taiwan' },
  EWY:  { riskScore: 8, assetClass: 'equity_emerging', category: 'ETF Corea' },
  // ── Fixed Income — government ─────────────────────────────────────────────────
  BIL:  { riskScore: 1, assetClass: 'cash',            category: 'ETF T-Bill' },
  SHV:  { riskScore: 1, assetClass: 'cash',            category: 'ETF T-Bill' },
  SHY:  { riskScore: 2, assetClass: 'fixed_income_ig', category: 'ETF Treasury 1-3Y' },
  IEF:  { riskScore: 2, assetClass: 'fixed_income_ig', category: 'ETF Treasury 7-10Y' },
  TLT:  { riskScore: 3, assetClass: 'fixed_income_ig', category: 'ETF Treasury 20Y+' },
  AGG:  { riskScore: 3, assetClass: 'fixed_income_ig', category: 'ETF Renta Fija Aggregate' },
  BND:  { riskScore: 3, assetClass: 'fixed_income_ig', category: 'ETF Renta Fija US' },
  BNDX: { riskScore: 3, assetClass: 'fixed_income_ig', category: 'ETF Renta Fija Internacional' },
  // ── Fixed Income — credit ─────────────────────────────────────────────────────
  LQD:  { riskScore: 4, assetClass: 'fixed_income_ig', category: 'ETF Corp IG' },
  VCIT: { riskScore: 4, assetClass: 'fixed_income_ig', category: 'ETF Corp IG' },
  IGLB: { riskScore: 4, assetClass: 'fixed_income_ig', category: 'ETF Corp IG Largo' },
  HYG:  { riskScore: 6, assetClass: 'fixed_income_hy', category: 'ETF High Yield' },
  JNK:  { riskScore: 6, assetClass: 'fixed_income_hy', category: 'ETF High Yield' },
  USHY: { riskScore: 6, assetClass: 'fixed_income_hy', category: 'ETF High Yield' },
  EMB:  { riskScore: 7, assetClass: 'fixed_income_hy', category: 'ETF Bonos EM USD' },
  PCY:  { riskScore: 7, assetClass: 'fixed_income_hy', category: 'ETF Bonos EM' },
  LEMB: { riskScore: 8, assetClass: 'fixed_income_hy', category: 'ETF Bonos LatAm' },
  // ── Commodities ───────────────────────────────────────────────────────────────
  GLD:  { riskScore: 7, assetClass: 'commodity', category: 'ETF Oro' },
  IAU:  { riskScore: 7, assetClass: 'commodity', category: 'ETF Oro' },
  GLDM: { riskScore: 7, assetClass: 'commodity', category: 'ETF Oro' },
  SLV:  { riskScore: 7, assetClass: 'commodity', category: 'ETF Plata' },
  USO:  { riskScore: 8, assetClass: 'commodity', category: 'ETF Petróleo' },
  UNG:  { riskScore: 8, assetClass: 'commodity', category: 'ETF Gas Natural' },
  DBC:  { riskScore: 7, assetClass: 'commodity', category: 'ETF Commodities' },
  PDBC: { riskScore: 7, assetClass: 'commodity', category: 'ETF Commodities' },
  GDX:  { riskScore: 8, assetClass: 'commodity', category: 'ETF Mineras Oro' },
  GDXJ: { riskScore: 9, assetClass: 'commodity', category: 'ETF Mineras Oro Junior' },
  // ── Real Estate ───────────────────────────────────────────────────────────────
  VNQ:  { riskScore: 6, assetClass: 'real_estate', category: 'ETF REIT US' },
  VNQI: { riskScore: 7, assetClass: 'real_estate', category: 'ETF REIT Global' },
  IYR:  { riskScore: 6, assetClass: 'real_estate', category: 'ETF Real Estate US' },
  // ── Sector ETFs ───────────────────────────────────────────────────────────────
  XLF:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Financiero' },
  XLE:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Energía' },
  XLV:  { riskScore: 6, assetClass: 'equity_diversified', category: 'ETF Sector Salud' },
  XLU:  { riskScore: 5, assetClass: 'equity_defensive',   category: 'ETF Sector Utilities' },
  XLP:  { riskScore: 5, assetClass: 'equity_defensive',   category: 'ETF Sector Consumo Básico' },
  XLY:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Consumo Discrecional' },
  XLI:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Industrial' },
  XLB:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Materiales' },
  XLRE: { riskScore: 6, assetClass: 'real_estate',        category: 'ETF Sector Real Estate' },
  XLC:  { riskScore: 7, assetClass: 'equity_diversified', category: 'ETF Sector Comunicaciones' },
  // ── Leveraged / Inverse — always 10 ──────────────────────────────────────────
  TQQQ: { riskScore: 10, assetClass: 'structured', category: 'ETF Apalancado 3x Nasdaq' },
  SQQQ: { riskScore: 10, assetClass: 'structured', category: 'ETF Inverso 3x Nasdaq' },
  SPXU: { riskScore: 10, assetClass: 'structured', category: 'ETF Inverso 3x S&P 500' },
  UPRO: { riskScore: 10, assetClass: 'structured', category: 'ETF Apalancado 3x S&P 500' },
  SSO:  { riskScore: 10, assetClass: 'structured', category: 'ETF Apalancado 2x S&P 500' },
  SDS:  { riskScore: 10, assetClass: 'structured', category: 'ETF Inverso 2x S&P 500' },
  UVXY: { riskScore: 10, assetClass: 'structured', category: 'ETF Volatilidad Apalancado' },
  VIXY: { riskScore: 10, assetClass: 'structured', category: 'ETF Volatilidad' },
  SVXY: { riskScore: 10, assetClass: 'structured', category: 'ETF Volatilidad Inverso' },
}

// ── Internal scoring helpers ──────────────────────────────────────────────────

/** Score a bond based on geography + credit quality */
function scoreFixedIncome(
  geo: GeoRisk,
  credit: CreditQuality,
  subtype: 'government' | 'municipal' | 'corporate' | 'generic',
  name: string,
): ScoringResult {
  // Distressed always → 9 regardless of geography
  if (credit === 'distressed') {
    return {
      assetClass: 'fixed_income_hy', riskScore: 9,
      category: 'Bono Distressed',
      explanation: `Bono distressed / default (${geoLabel(geo)}) → Score 9`,
    }
  }

  // T-Bill / Money Market (only developed IG)
  if (/\b(t.?bill|treasury.?bill|money.?market|mmf|deposit)\b/i.test(name))
    return { assetClass: 'cash', riskScore: 1, category: 'T-Bill / Money Market', explanation: 'T-Bill / Money Market → Score 1' }

  if (geo === 'argentina') {
    const score = subtype === 'government' ? 9 : credit === 'hy' ? 9 : 8
    return {
      assetClass: 'fixed_income_hy', riskScore: score,
      category: subtype === 'government' ? 'Bono Soberano Argentina' : 'Bono Corporativo Argentina',
      explanation: `${subtype === 'government' ? 'Soberano' : 'Corporativo'} Argentina → Score ${score}`,
    }
  }

  if (geo === 'latam') {
    const score = subtype === 'government' ? 7 : credit === 'hy' ? 8 : 7
    return {
      assetClass: 'fixed_income_hy', riskScore: score,
      category: subtype === 'government' ? 'Bono Soberano LatAm' : 'Bono Corporativo LatAm',
      explanation: `${subtype === 'government' ? 'Soberano' : 'Corporativo'} LatAm → Score ${score}`,
    }
  }

  if (geo === 'em' || geo === 'frontier') {
    const score = geo === 'frontier' ? 8 : 7
    return {
      assetClass: 'fixed_income_hy', riskScore: score,
      category: subtype === 'government' ? 'Bono Soberano EM' : 'Bono Corporativo EM',
      explanation: `${subtype === 'government' ? 'Soberano' : 'Corporativo'} ${geoLabel(geo)} → Score ${score}`,
    }
  }

  // Developed market bonds
  if (subtype === 'government' || subtype === 'municipal') {
    const score = /\b(long.?term|20.?yr|30.?yr)\b/i.test(name) ? 3 : 2
    return {
      assetClass: 'fixed_income_ig', riskScore: score,
      category: subtype === 'municipal' ? 'Bono Municipal' : 'Bono Soberano Desarrollado',
      explanation: `${subtype === 'municipal' ? 'Municipal' : 'Soberano'} desarrollado → Score ${score}`,
    }
  }

  // Developed corporate
  if (credit === 'hy') {
    return {
      assetClass: 'fixed_income_hy', riskScore: 6,
      category: 'Corporate Bond High Yield',
      explanation: 'Corporate Bond HY (desarrollado) → Score 6',
    }
  }
  if (credit === 'ig') {
    return {
      assetClass: 'fixed_income_ig', riskScore: 4,
      category: 'Corporate Bond IG',
      explanation: 'Corporate Bond IG (desarrollado) → Score 4',
    }
  }
  // Unknown credit + developed corporate / generic
  return {
    assetClass: 'fixed_income_ig', riskScore: 4,
    category: 'Renta Fija Corporativa',
    explanation: `Renta fija corporativa (${geoLabel(geo)}) → Score 4`,
  }
}

/** Score an equity based on geography and type */
function scoreEquity(
  geo: GeoRisk,
  typeHint: string,
  name: string,
): ScoringResult {
  // Crypto keywords override geography
  if (/\b(bitcoin|btc|ethereum|eth\b|crypto|altcoin|defi|token\b)\b/i.test(name))
    return { assetClass: 'crypto', riskScore: 9, category: 'Cripto', explanation: 'Criptomoneda → Score 9' }

  // REIT / Real Estate
  if (/\b(reit|real.?estate|property|trust\b)\b/i.test(typeHint + ' ' + name))
    return { assetClass: 'real_estate', riskScore: 6, category: 'Real Estate / REIT', explanation: 'REIT / Real Estate → Score 6' }

  // Preferred stock
  if (/\bpreferred\b/i.test(typeHint)) {
    const score = geo === 'argentina' ? 8 : geo === 'latam' || geo === 'em' ? 7 : 5
    return {
      assetClass: 'equity_defensive', riskScore: score,
      category: 'Acciones Preferentes',
      explanation: `Acciones preferentes (${geoLabel(geo)}) → Score ${score}`,
    }
  }

  // ADR / GDR — re-detect geo from name (since exchCode is always US)
  if (/\b(adr|gdr)\b/i.test(typeHint + ' ' + name)) {
    const underlyingGeo = detectGeo(name)
    const score = underlyingGeo === 'argentina' ? 9
                : underlyingGeo === 'latam'     ? 8
                : underlyingGeo === 'em'        ? 8
                : underlyingGeo === 'frontier'  ? 9
                : 7   // developed ADR (e.g. European companies listed on NYSE)
    const label = underlyingGeo === 'developed' ? 'ADR mercado desarrollado' : `ADR ${geoLabel(underlyingGeo)}`
    return {
      assetClass: score >= 8 ? 'equity_emerging' : 'equity_diversified',
      riskScore: score,
      category: 'ADR / GDR',
      explanation: `${label} → Score ${score}`,
    }
  }

  const scoreByGeo: Record<GeoRisk, number> = {
    developed: 7,
    latam:     8,
    argentina: 9,
    em:        8,
    frontier:  9,
  }
  const score = scoreByGeo[geo]
  const assetClass: AssetClass = geo === 'developed' ? 'equity_diversified'
                                : geo === 'latam' || geo === 'em' ? 'equity_emerging'
                                : geo === 'argentina' || geo === 'frontier' ? 'equity_emerging'
                                : 'equity_diversified'
  return {
    assetClass, riskScore: score,
    category: geo === 'developed' ? 'Acciones' : `Acciones ${geoLabel(geo)}`,
    explanation: `Equity ${geoLabel(geo)} → Score ${score}`,
  }
}

/** Score an ETF by ticker (known table) or by name + geo heuristics */
function scoreETF(ticker: string | undefined, name: string): ScoringResult {
  // 1. Known ticker lookup
  const t = (ticker ?? '').toUpperCase().trim()
  if (t && KNOWN_ETF_TICKERS[t]) {
    const k = KNOWN_ETF_TICKERS[t]
    return { ...k, explanation: `${k.category} (${t}) → Score ${k.riskScore}` }
  }

  // 2. Complexity: leveraged/inverse → 10
  const complexity = detectComplexity(name)
  if (complexity === 'leveraged' || complexity === 'inverse') {
    const cat = complexity === 'leveraged' ? 'ETF Apalancado' : 'ETF Inverso'
    return { assetClass: 'structured', riskScore: 10, category: cat, explanation: `${cat} → Score 10` }
  }
  if (complexity === 'structured') {
    return { assetClass: 'structured', riskScore: 9, category: 'ETF Estructurado', explanation: 'ETF estructurado / barrera → Score 9' }
  }

  // 3. Name-based heuristics
  const n = name.toLowerCase()
  if (/money.?market|t.?bill|ultra.?short|treasury.?bill/i.test(n))
    return { assetClass: 'cash', riskScore: 1, category: 'ETF Money Market', explanation: 'ETF Money Market → Score 1' }
  if (/\b(aggregate|agg\b|treasury|govt\.?bond|government.?bond|bond\s+etf|renta\s+fija)\b/i.test(n))
    return { assetClass: 'fixed_income_ig', riskScore: 3, category: 'ETF Renta Fija IG', explanation: 'ETF Renta Fija IG → Score 3' }
  if (/high.?yield|\bhy\b|junk/i.test(n))
    return { assetClass: 'fixed_income_hy', riskScore: 6, category: 'ETF High Yield', explanation: 'ETF High Yield → Score 6' }
  if (/emerg|latam|frontier/i.test(n)) {
    const geo = detectGeo(name)
    const score = geo === 'argentina' ? 9 : 8
    return { assetClass: 'equity_emerging', riskScore: score, category: `ETF ${geoLabel(geo)}`, explanation: `ETF mercados emergentes (${geoLabel(geo)}) → Score ${score}` }
  }
  if (/s&p.?500|sp500|total.?market|msci.?world|msci.?usa/i.test(n))
    return { assetClass: 'equity_diversified', riskScore: 5, category: 'ETF Equity Diversificado', explanation: 'ETF S&P 500 / MSCI World → Score 5' }
  if (/nasdaq|growth|tech(?:nology)?|innovation|cloud|semicon|ai\b/i.test(n))
    return { assetClass: 'equity_growth', riskScore: 7, category: 'ETF Growth / Tech', explanation: 'ETF Growth / Tech → Score 7' }
  if (/eafe|developed.?market|ex.?us|international.?equity/i.test(n))
    return { assetClass: 'equity_diversified', riskScore: 6, category: 'ETF Desarrollados ex-US', explanation: 'ETF mercados desarrollados ex-US → Score 6' }
  if (/sector|energy|financ|health|biotech|consumer|industri|material|utilit/i.test(n))
    return { assetClass: 'equity_diversified', riskScore: 7, category: 'ETF Sectorial', explanation: 'ETF sectorial → Score 7' }
  if (/reit|real.?estate|property/i.test(n))
    return { assetClass: 'real_estate', riskScore: 6, category: 'ETF Real Estate', explanation: 'ETF Real Estate / REIT → Score 6' }
  if (/gold|silver|oil|commodity|metal/i.test(n))
    return { assetClass: 'commodity', riskScore: 7, category: 'ETF Commodity', explanation: 'ETF Commodities → Score 7' }
  if (/crypto|bitcoin|blockchain/i.test(n))
    return { assetClass: 'crypto', riskScore: 9, category: 'ETF Cripto', explanation: 'ETF Cripto → Score 9' }

  // 4. Geo-based fallback: país/región en nombre (EWW, EWZ no en tabla, ETFs de mercados específicos)
  const geoFallback = detectGeo(name)
  if (geoFallback !== 'developed') {
    const score = geoFallback === 'argentina' ? 9 : geoFallback === 'frontier' ? 9 : 8
    return {
      assetClass: 'equity_emerging', riskScore: score,
      category: `ETF ${geoLabel(geoFallback)}`,
      explanation: `ETF país/región (${geoLabel(geoFallback)}) → Score ${score}`,
    }
  }

  // Generic ETF — cannot determine further
  return { assetClass: 'fund', riskScore: 5, category: 'ETF / Fondo', explanation: 'ETF / Fondo genérico → Score 5' }
}

/** Score a mutual fund by name */
function scoreMutualFund(name: string): ScoringResult | null {
  const n = name.toLowerCase()
  if (/money.?market|cash.?mgmt|liquidity|ultra.?short/i.test(n))
    return { assetClass: 'cash', riskScore: 1, category: 'Fondo Liquidez', explanation: 'Fondo de liquidez / money market → Score 1' }
  if (/short.?dur|short.?term|t.?bill|treasury\s+fund/i.test(n))
    return { assetClass: 'fixed_income_ig', riskScore: 2, category: 'Fondo Renta Fija Corto', explanation: 'Fondo renta fija corto plazo → Score 2' }
  // CoCo / Contingent Capital / AT1 — alto riesgo estructural
  if (/contingent.?capital|coco\b|coco\s+bond|at1\b|additional\s+tier\s+1/i.test(n))
    return { assetClass: 'fixed_income_hy', riskScore: 8, category: 'Fondo CoCo / AT1', explanation: 'Fondo Contingent Capital / CoCo AT1 → Score 8' }
  if (/bond\s+fund|income\s+fund|fixed.?income|invest.?grade/i.test(n))
    return { assetClass: 'fixed_income_ig', riskScore: 4, category: 'Fondo Renta Fija', explanation: 'Fondo de renta fija → Score 4' }
  if (/high.?yield|junk|credit.?opport/i.test(n))
    return { assetClass: 'fixed_income_hy', riskScore: 6, category: 'Fondo High Yield', explanation: 'Fondo High Yield → Score 6' }
  if (/private.?credit|private.?debt|direct.?lend/i.test(n))
    return { assetClass: 'fixed_income_hy', riskScore: 7, category: 'Private Credit', explanation: 'Fondo Private Credit → Score 7' }
  if (/argentin/i.test(n))
    return { assetClass: 'equity_emerging', riskScore: 9, category: 'Fondo Argentina', explanation: 'Fondo con exposición Argentina → Score 9' }
  if (/latam|brazil|emerg|frontier/i.test(n))
    return { assetClass: 'equity_emerging', riskScore: 8, category: 'Fondo Emergente', explanation: 'Fondo mercados emergentes → Score 8' }
  if (/global.?equity|equity.?fund|franchise|focus.?equity|world.?fund|international.?equity/i.test(n))
    return { assetClass: 'equity_diversified', riskScore: 7, category: 'Fondo Equity Global', explanation: 'Fondo equity global → Score 7' }
  if (/growth.?fund|tech.?fund|innovation/i.test(n))
    return { assetClass: 'equity_growth', riskScore: 7, category: 'Fondo Growth', explanation: 'Fondo Growth / Tech → Score 7' }
  if (/s&p|total.?market|index.?fund|msci\s+usa/i.test(n))
    return { assetClass: 'equity_diversified', riskScore: 5, category: 'Fondo Indexado S&P', explanation: 'Fondo indexado S&P 500 → Score 5' }
  return null  // cannot classify
}

// ── Main scoring functions ────────────────────────────────────────────────────

/**
 * Score an asset from OpenFIGI response data.
 * Returns ScoringResult (with explanation) or null if cannot classify.
 */
export function scoreFromFIGI(figi: FIGIResult): ScoringResult | null {
  const sector = (figi.marketSector ?? '').toLowerCase()
  const type   = (figi.securityType ?? '').toLowerCase()
  const type2  = (figi.securityType2 ?? '').toLowerCase()
  const name   = figi.name ?? ''
  const ticker = figi.ticker ?? ''
  const exch   = figi.exchCode ?? ''
  const combined = `${name} ${type} ${type2}`

  // ── Money Market ──────────────────────────────────────────────────────────────
  if (sector === 'money mkt' || /money.?market|mmf/i.test(type))
    return { assetClass: 'cash', riskScore: 1, category: 'Money Market', explanation: 'Money Market → Score 1' }

  // ── Options / Derivatives ─────────────────────────────────────────────────────
  if (/option|future|warrant|derivative|swap/i.test(type))
    return { assetClass: 'derivatives', riskScore: 9, category: 'Opciones / Derivados', explanation: 'Opciones / Derivados → Score 9' }

  // ── Commodity ─────────────────────────────────────────────────────────────────
  if (sector === 'commodity' || /commodity/i.test(type))
    return { assetClass: 'commodity', riskScore: 7, category: 'Commodity', explanation: 'Commodity → Score 7' }

  // ── Crypto ────────────────────────────────────────────────────────────────────
  if (/crypto|bitcoin|ethereum/i.test(combined))
    return { assetClass: 'crypto', riskScore: 9, category: 'Cripto', explanation: 'Criptomoneda → Score 9' }

  // ── ETF ───────────────────────────────────────────────────────────────────────
  if (/\betf\b|exchange.?traded/i.test(type + ' ' + type2))
    return scoreETF(ticker, name)

  // ── Mutual Fund ───────────────────────────────────────────────────────────────
  if (/mutual.?fund|open.?end|closed.?end|unit.?invest|interval.?fund/i.test(type + ' ' + type2)) {
    const mf = scoreMutualFund(name)
    return mf ?? null
  }

  // ── Fixed Income ──────────────────────────────────────────────────────────────
  if (sector === 'fixed income' || /bond|note\b|debenture/i.test(type)) {
    const geo    = detectGeo(combined, exch)
    const credit = detectCredit(combined)

    if (/t.?bill|treasury.?bill/i.test(type + name))
      return { assetClass: 'cash', riskScore: 1, category: 'Treasury Bill', explanation: 'Treasury Bill → Score 1' }

    const subtype = /government|treasury|sovereign|us\s*gov|municipal|muni/i.test(type)
      ? (/municipal|muni/i.test(type) ? 'municipal' : 'government')
      : /corporate|corp/i.test(type) ? 'corporate' : 'generic'

    return scoreFixedIncome(geo, credit, subtype as any, combined)
  }

  // ── Equity ────────────────────────────────────────────────────────────────────
  if (sector === 'equity') {
    const geo = detectGeo(combined, exch)
    return scoreEquity(geo, type, combined)
  }

  return null
}

/**
 * Fallback scoring when OpenFIGI is not available.
 * Uses Security Type column from Excel + name heuristics.
 */
export function scoreFallback(
  rawName:        string,
  identifierType: string,
  securityType?:  string,
): ScoringResult | null {
  const combined = `${rawName} ${securityType ?? ''}`.trim()

  // ── Security Type column priority ────────────────────────────────────────────
  if (securityType) {
    const st = securityType.toLowerCase()

    if (/t.?bill|treasury.?bill/i.test(st))
      return { assetClass: 'cash', riskScore: 1, category: 'Treasury Bill', explanation: 'T-Bill → Score 1' }
    if (/money.?market|cash\b|mmf|deposit/i.test(st))
      return { assetClass: 'cash', riskScore: 1, category: 'Money Market', explanation: 'Money Market / Cash → Score 1' }

    if (/government|treasury|sovereign/i.test(st)) {
      const geo    = detectGeo(combined)
      const credit = detectCredit(combined)
      return scoreFixedIncome(geo, credit, 'government', combined)
    }
    if (/municipal|muni/i.test(st)) {
      return scoreFixedIncome('developed', 'ig', 'municipal', combined)
    }
    if (/corporate.?bond|corp.?bond/i.test(st)) {
      const geo    = detectGeo(combined)
      const credit = detectCredit(combined)
      return scoreFixedIncome(geo, credit, 'corporate', combined)
    }
    if (/\bbond\b|fixed.?income|note\b|renta.?fija/i.test(st)) {
      const geo    = detectGeo(combined)
      const credit = detectCredit(combined)
      return scoreFixedIncome(geo, credit, 'generic', combined)
    }

    if (/common.?stock|ordinary/i.test(st)) {
      const geo = detectGeo(combined)
      return scoreEquity(geo, 'common stock', combined)
    }
    if (/preferred/i.test(st)) {
      const geo = detectGeo(combined)
      return scoreEquity(geo, 'preferred', combined)
    }
    if (/\badr\b|\bgdr\b/i.test(st)) {
      const geo = detectGeo(combined)
      return scoreEquity(geo, 'adr', combined)
    }
    if (/\betf\b|exchange.?traded/i.test(st))
      return scoreETF(undefined, rawName)
    if (/mutual.?fund|open.?end/i.test(st)) {
      const mf = scoreMutualFund(rawName)
      return mf ?? { assetClass: 'fund', riskScore: 5, category: 'Fondo Mutuo', explanation: 'Fondo mutuo genérico → Score 5' }
    }
    if (/limited.?partner|lp\b/i.test(st))
      return { assetClass: 'other', riskScore: 7, category: 'Limited Partnership', explanation: 'Limited Partnership → Score 7' }
    if (/structured/i.test(st))
      return { assetClass: 'structured', riskScore: 8, category: 'Producto Estructurado', explanation: 'Producto estructurado → Score 8' }
    if (/option|future|warrant|deriv/i.test(st))
      return { assetClass: 'derivatives', riskScore: 9, category: 'Opciones / Derivados', explanation: 'Opciones / Derivados → Score 9' }
    if (/reit|real.?estate/i.test(st))
      return { assetClass: 'real_estate', riskScore: 6, category: 'Real Estate / REIT', explanation: 'REIT / Real Estate → Score 6' }
  }

  // ── Name-based heuristics ────────────────────────────────────────────────────
  const n = rawName

  if (/\b(bond|note\b|bono|nt\b|debenture|oblig)\b/i.test(n)) {
    const geo    = detectGeo(combined)
    const credit = detectCredit(combined)
    return scoreFixedIncome(geo, credit, 'generic', combined)
  }
  if (/\b(etf|exchange.?traded)\b/i.test(n))
    return scoreETF(undefined, n)
  if (/\b(fund|fondo|trust)\b/i.test(n)) {
    const mf = scoreMutualFund(n)
    return mf ?? { assetClass: 'fund', riskScore: 5, category: 'Fondo', explanation: 'Fondo genérico → Score 5' }
  }
  if (/\b(cash|money.?market|mmf|t.?bill)\b/i.test(n))
    return { assetClass: 'cash', riskScore: 1, category: 'Cash', explanation: 'Cash / Money Market → Score 1' }

  // ISIN / CUSIP with no other info — assume fixed income (most common in portfolios)
  if (identifierType === 'isin' || identifierType === 'cusip') {
    const geo    = detectGeo(combined)
    const credit = detectCredit(combined)
    return scoreFixedIncome(geo, credit, 'generic', combined)
  }

  return null
}

// ── Portfolio score calculation ───────────────────────────────────────────────

export interface ScoredPosition {
  raw_name:      string
  market_value:  number
  weight:        number
  risk_score:    number | null
  asset_class:   string | null
  classification_status: 'classified' | 'pending' | 'manual'
}

export function calculatePortfolioScore(positions: ScoredPosition[]): {
  score:             number
  profile:           RiskProfile
  classified_weight: number
  pending_weight:    number
  top_risk:          ScoredPosition[]
} {
  const hasWeights = positions.some(p => (p.weight ?? 0) > 0)
  let work = positions

  if (!hasWeights) {
    const totalMV = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
    if (totalMV > 0) {
      work = positions.map(p => ({
        ...p,
        weight: ((p.market_value ?? 0) / totalMV) * 100,
      }))
    }
  }

  let weightedScore    = 0
  let classifiedWeight = 0
  let pendingWeight    = 0

  for (const p of work) {
    const w = p.weight ?? 0
    if (p.risk_score != null && w > 0) {
      weightedScore    += (w / 100) * p.risk_score
      classifiedWeight += w
    } else {
      pendingWeight += w
    }
  }

  const score   = classifiedWeight > 0 ? weightedScore / (classifiedWeight / 100) : 0
  const profile = scoreToProfile(score)

  const top_risk = [...work]
    .filter(p => p.risk_score != null)
    .sort((a, b) => ((b.risk_score ?? 0) * (b.weight ?? 0)) - ((a.risk_score ?? 0) * (a.weight ?? 0)))
    .slice(0, 5)

  return { score, profile, classified_weight: classifiedWeight, pending_weight: pendingWeight, top_risk }
}

// ── Explanation generator ─────────────────────────────────────────────────────

export function generateExplanation(
  portfolioScore:   number,
  portfolioProfile: RiskProfile,
  clientProfile:    RiskProfile,
  aligned:          boolean,
  pendingWeight:    number,
): string {
  const labels: Record<RiskProfile, string> = {
    conservador: 'Conservador',
    moderado:    'Moderado',
    agresivo:    'Agresivo',
  }
  let text = `Score de riesgo: ${portfolioScore.toFixed(2)}/10 → Perfil ${labels[portfolioProfile]}. `
  text += `Perfil declarado: ${labels[clientProfile]}. `
  if (aligned) {
    text += 'Cartera alineada con el perfil del cliente.'
  } else if (portfolioProfile === 'agresivo') {
    text += 'Cartera con riesgo superior al perfil declarado. Revisar posiciones de mayor riesgo.'
  } else if (portfolioProfile === 'conservador') {
    text += 'Cartera más conservadora que el perfil declarado.'
  } else {
    text += 'Discrepancia entre riesgo de cartera y perfil declarado.'
  }
  if (pendingWeight > 10)
    text += ` Nota: ${pendingWeight.toFixed(1)}% pendiente de clasificación.`
  return text
}

// ── Legacy export (kept for backward compat with any direct callers) ──────────
/** @deprecated Use scoreFromFIGI (returns ScoringResult with explanation) */
export function applyKeywordAdjustments(baseScore: number, text: string): number {
  const t = text
  if (/\b(leverag|inverse\b|2x|3x|ultra\s+short|ultra\s+long)/i.test(t)) return 10
  if (/\b(distressed|default|bankrupt)/i.test(t))                          return 9
  if (/\b(bitcoin|ethereum|crypto|btc|eth\b|altcoin|defi)/i.test(t))      return 9
  let score = baseScore
  if (/\bhigh.?yield|\bHY\b|junk/i.test(t))                               score = Math.max(score, 6)
  if (/\bprivate.?credit|priv\.?\s*debt|private\s+debt/i.test(t))         score = Math.max(score, 7)
  if (/\bcoco\b|contingent.?capital/i.test(t))                             score = Math.max(score, 7)
  if (/\b(growth|nasdaq|qqq|tech(?:nology)?|innovation|cloud|ai\b|semi(?:conductor)?)/i.test(t))
                                                                            score = Math.max(score, 7)
  if (/\b(emerg|latam|brazil|mexico|argentin|colombia|peru|chile|frontier)/i.test(t))
                                                                            score = Math.max(score, Math.min(score + 1, 8))
  if (/\b(structured|barrier|capital\s+protected|autocall|principal\s+at\s+risk)/i.test(t))
                                                                            score = Math.max(score, 8)
  if (/\binvestment.?grade|\bIG\b/i.test(t))                               score = Math.min(score, 4)
  if (/\btreasury|\bt.?bill|us\s+gov|us\s+treasury/i.test(t))             score = Math.min(score, 2)
  if (/\bmoney.?market|\bcash\b|\bdeposit\b|\bmmf\b/i.test(t))            return 1
  return Math.min(Math.max(Math.round(score), 1), 10)
}
