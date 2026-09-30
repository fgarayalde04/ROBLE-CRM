/**
 * Criterio de riesgo genérico — 7 grupos, iguales para fondos, bonos y acciones.
 *
 *   Liquidez                    1   Conservador
 *   RF grado de inversión       3   Conservador
 *   RF alto rendimiento         5   Moderado
 *   Mixtos                      5   Moderado
 *   RV desarrollada             6   Moderado
 *   RV emergente / específica   8   Agresivo
 *   Especulativo               10   Agresivo
 *
 * Perfiles: conservador 1-3, moderado 4-6, agresivo 7-10. Cada perfil puede
 * comprar cualquier instrumento hasta su tope.
 *
 * Se clasifica a propósito de forma amplia: lo que no encaja queda
 * "sin clasificar" para ajustarlo a mano, en vez de adivinar un puntaje fino.
 */

export type RiskGroup =
  | 'liquidez'
  | 'rf_ig'
  | 'rf_ar'
  | 'mixtos'
  | 'rv_desarrollada'
  | 'rv_especifica'
  | 'especulativo'

export const RISK_GROUPS: Record<RiskGroup, { label: string; puntaje: number; incluye: string }> = {
  liquidez:        { label: 'Liquidez',                  puntaje: 1,  incluye: 'Money market, T-Bills, corto plazo' },
  rf_ig:           { label: 'RF grado de inversión',     puntaje: 3,  incluye: 'Bonos y fondos investment grade (incluye Uruguay)' },
  rf_ar:           { label: 'RF alto rendimiento',       puntaje: 5,  incluye: 'High yield, emergentes, híbridos, convertibles' },
  mixtos:          { label: 'Mixtos',                    puntaje: 5,  incluye: 'Balanceados, multi-asset, alternativos, private debt' },
  rv_desarrollada: { label: 'RV desarrollada',           puntaje: 6,  incluye: 'Acciones, ETFs y fondos de EE.UU./Europa/Japón, real estate, commodities' },
  rv_especifica:   { label: 'RV emergente / específica', puntaje: 8,  incluye: 'Emergentes, Argentina, temáticos, growth, small caps, private equity, bonos CCC' },
  especulativo:    { label: 'Especulativo',              puntaje: 10, incluye: 'Apalancados, inversos, derivados, bonos en default' },
}

export const RISK_GROUP_ORDER: RiskGroup[] = [
  'liquidez', 'rf_ig', 'rf_ar', 'mixtos', 'rv_desarrollada', 'rv_especifica', 'especulativo',
]

export type Perfil = 'conservador' | 'moderado' | 'agresivo'

export const PERFIL_TOPE: Record<Perfil, number> = { conservador: 3, moderado: 6, agresivo: 10 }

export function perfilFromPuntaje(p: number): Perfil {
  if (p <= PERFIL_TOPE.conservador) return 'conservador'
  if (p <= PERFIL_TOPE.moderado) return 'moderado'
  return 'agresivo'
}

export type RiskFuente = 'monitor' | 'categoria' | 'nombre' | 'rating' | 'pais' | 'manual' | 'sin_clasificar'

export interface RiskResult {
  grupo: RiskGroup | null
  puntaje: number | null
  fuente: RiskFuente
  revisar: boolean
}

export interface ClassifyInput {
  tipo_activo: 'fondo' | 'bono' | 'accion' | string
  nombre: string
  categoria?: string | null
  emisor?: string | null
  isin?: string | null
  rating?: string | null
  maturity_date?: string | null
  /** Categoría y subcategoría del Monitor de Fondos, si el ISIN está ahí */
  monitor_categoria?: string | null
  monitor_subcategoria?: string | null
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const result = (grupo: RiskGroup | null, fuente: RiskFuente, revisar = false): RiskResult =>
  grupo
    ? { grupo, puntaje: RISK_GROUPS[grupo].puntaje, fuente, revisar }
    : { grupo: null, puntaje: null, fuente: 'sin_clasificar', revisar: true }

// ── Clasificación por texto (categoría del Monitor, categoría o nombre) ─────

const RE = {
  especulativo: /\b(leveraged|apalancad\w*|inverse|inverso|ultrapro|[23]x)\b/,
  privateEquity: /private equity/,
  mixto: /(balanced|balanceado|multi[- ]?asset|allocation|prudent|income (&|and) growth|alternativ|absolute return|retorno absoluto|private debt|private credit|\bbdc\b|debt solutions|multi[- ]?strateg)/,
  equity: /(equity|equities|acciones|renta variable|\brv\b|stock|shares|growth|value|small ?cap|mid ?cap|large ?cap|dividend|brands|franchise|thematic|tematic|technology|\btech\b|innovation|robotics|health|consumer|energy|infrastructure|real estate|property|propert|reit|gold|commodit)/,
  bond: /(bond|\bbd\b|debt|credit|fixed income|income|renta fija|\brf\b|treasur|govt|government|aggregate|duration|maturity|\bloans?\b|floating|tasa flotante|high yield|yield)/,
  hy: /(high yield|\bhy\b|convertib|hybrid|capital securities|\bcoco|subordinat|\bat1\b|distress|local currency|moneda local|\bmonedas\b|currencies|opportunit|\bopp\b|unconstrained|dynamic|alpha)/,
  em: /(emerg|\bem\b|frontier|latin|latam|asia|china|india|brazil|brasil|mexic|argentin|korea|taiwan)/,
  especifica: /(growth|small ?cap|mid ?cap|thematic|tematic|technology|\btech\b|innovation|robotics|\b5g\b|biotech|disrupt|fintech|luxury|smart energy|clean energy|energy transition|climate|water|digital|cyber|semiconductor|artificial intel|\bai\b)/,
  liquidez: /(money market|\bmm\b|liquidity|liquidez|t-?bills?|treasury bills?|\bcash\b|corto plazo|short[- ]term|s\/t|ultra[- ]?short|short duration|limited maturity|low duration|mercado monetario)/,
}

// Abreviaturas típicas de los nombres de Bloomberg/Pershing ("GBL HGH YLD BD").
const ABREVIATURAS: [RegExp, string][] = [
  [/\b(bd|bds|bnd|bnds)\b/g, 'bond'],
  [/\b(hgh|hig|hi|h) ?(yld|yield)\b|\bh\/y\b/g, 'high yield'],
  [/\bpvt eq\b/g, 'private equity'],
  [/\bmegatren\w*/g, 'megatrends thematic'],
  [/\byld\b/g, 'yield'],
  [/\b(eq|eqty|equit|eqt)\b/g, 'equity'],
  [/\b(emk|emg|emrg|emkt|em mkts?|emerg mkts?)\b/g, 'emerging'],
  [/\bfrntr\b/g, 'frontier'],
  [/\bconvert\b/g, 'convertible'],
  [/\binc\b/g, 'income'],
  [/\bdur\b/g, 'duration'],
  [/\bu\/s\b/g, 'ultra short'],
  [/\b(sm|sml) ?(cap|co)\b|smaller compan/g, 'small cap'],
  [/\b(grw|grth|gr)\b/g, 'growth'],
  [/\btechnol\w*/g, 'technology'],
  [/\b(bal|balncd)\b/g, 'balanced'],
  [/\balloc\b/g, 'allocation'],
  [/\bmulti ?asst?\b/g, 'multi asset'],
  [/\breal est\b/g, 'real estate'],
]

export function classifyText(text: string): RiskGroup | null {
  let t = norm(text)
  for (const [re, rep] of ABREVIATURAS) t = t.replace(re, rep)
  if (!t.trim()) return null
  if (RE.especulativo.test(t)) return 'especulativo'
  if (RE.privateEquity.test(t)) return 'rv_especifica'
  if (RE.mixto.test(t)) return 'mixtos'

  const isEquityWord = /(equity|equities|acciones|renta variable|stock|real estate|reit|propert)/.test(t)
  if (RE.bond.test(t) && !isEquityWord) {
    if (RE.hy.test(t) || RE.em.test(t)) return 'rf_ar'
    if (RE.liquidez.test(t)) return 'liquidez'
    return 'rf_ig'
  }
  if (RE.liquidez.test(t)) return 'liquidez'
  if (RE.equity.test(t)) {
    if (RE.em.test(t) || RE.especifica.test(t)) return 'rv_especifica'
    return 'rv_desarrollada'
  }
  return null
}

// ── Bonos: por rating ────────────────────────────────────────────────────────

const MOODYS_TO_SP: Record<string, string> = {
  aaa: 'AAA', aa1: 'AA+', aa2: 'AA', aa3: 'AA-', a1: 'A+', a2: 'A', a3: 'A-',
  baa1: 'BBB+', baa2: 'BBB', baa3: 'BBB-', ba1: 'BB+', ba2: 'BB', ba3: 'BB-',
  b1: 'B+', b2: 'B', b3: 'B-', caa1: 'CCC+', caa2: 'CCC', caa3: 'CCC-', ca: 'CC', c: 'C',
}

/** Tramo del rating más bajo que aparezca en el texto (S&P, Fitch o Moody's). */
export function ratingTier(rating: string | null | undefined): 'ig' | 'hy' | 'ccc' | 'default' | null {
  if (!rating) return null
  const tokens = rating.split(/[\s/,;|()]+/).filter(Boolean)
  let worst: number | null = null
  for (const raw of tokens) {
    const tok = raw.trim()
    const sp = MOODYS_TO_SP[tok.toLowerCase()] ?? tok.toUpperCase()
    let tier: number | null = null
    if (/^(SD|RD|D|DDD|DD)$/.test(sp)) tier = 3
    else if (/^(CCC[+-]?|CC|C)$/.test(sp)) tier = 2
    else if (/^(BB[+-]?|B[+-]?)$/.test(sp)) tier = 1
    else if (/^(AAA|AA[+-]?|A[+-]?|BBB[+-]?)$/.test(sp)) tier = 0
    if (tier != null && (worst == null || tier > worst)) worst = tier
  }
  return worst == null ? null : (['ig', 'hy', 'ccc', 'default'] as const)[worst]
}

function yearsToMaturity(date: string | null | undefined): number | null {
  if (!date) return null
  const t = Date.parse(date)
  if (Number.isNaN(t)) return null
  return (t - Date.now()) / (365.25 * 24 * 3600 * 1000)
}

function classifyBond(i: ClassifyInput): RiskResult {
  const text = norm(`${i.nombre} ${i.emisor ?? ''} ${i.categoria ?? ''}`)
  const subordinado = /(subordinat|hybrid|\bat1\b|\bcoco|convertib|perpetu|\bperp\b|junior)/.test(text)
  const tier = ratingTier(i.rating)
  const pais = i.isin?.slice(0, 2).toUpperCase()

  if (tier) {
    if (tier === 'default') return result('especulativo', 'rating')
    if (tier === 'ccc') return result('rv_especifica', 'rating')
    if (tier === 'hy') return result('rf_ar', 'rating')
    if (subordinado) return result('rf_ar', 'rating')
    const years = yearsToMaturity(i.maturity_date)
    if (years != null && years <= 1) return result('liquidez', 'rating')
    return result('rf_ig', 'rating')
  }

  // Sin rating cargado
  if (/(t-?bills?|treasury bill|letras? del tesoro)/.test(text)) return result('liquidez', 'nombre')
  if (/(treasury|\bust\b|us govt|tesoro)/.test(text)) return result('rf_ig', 'nombre')
  if (pais === 'UY' || /uruguay/.test(text)) return result(subordinado ? 'rf_ar' : 'rf_ig', 'pais')
  if (pais === 'AR' || /argentin|\bargent\b/.test(text)) return result('rv_especifica', 'pais')
  return result(null, 'sin_clasificar')
}

// ── Acciones: ETFs por texto, el resto por país del ISIN ────────────────────

const PAISES_DESARROLLADOS = new Set([
  'US', 'CA', 'GB', 'IE', 'DE', 'FR', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK', 'FI', 'IT', 'ES', 'PT',
  'AT', 'LU', 'JP', 'AU', 'NZ', 'SG', 'HK', 'IL',
])

function classifyStock(i: ClassifyInput): RiskResult {
  const text = norm(`${i.nombre} ${i.categoria ?? ''}`)
  if (RE.especulativo.test(text)) return result('especulativo', 'nombre')
  if (/\b(etf|ishares|spdr|vanguard|invesco|wisdomtree|fund|trust|index)\b/.test(text)) {
    const g = classifyText(text)
    if (g) return result(g, 'nombre')
  }
  const pais = i.isin?.slice(0, 2).toUpperCase()
  if (!pais) return result('rv_desarrollada', 'pais', true)          // sin ISIN: asumimos desarrollada, a revisar
  if (PAISES_DESARROLLADOS.has(pais)) return result('rv_desarrollada', 'pais')
  if (['KY', 'BM', 'VG'].includes(pais)) return result('rv_especifica', 'pais', true) // domicilio off-shore: ver el emisor
  return result('rv_especifica', 'pais')
}

// ── Fondos: Monitor → categoría cargada → nombre ────────────────────────────

function classifyFund(i: ClassifyInput): RiskResult {
  if (/money market|\bmm\b|s\/t mm/.test(norm(i.nombre))) return result('liquidez', i.monitor_categoria ? 'monitor' : 'nombre')
  if (i.monitor_categoria) {
    const g = classifyText(`${i.monitor_categoria} ${i.monitor_subcategoria ?? ''}`)
    if (g) return result(g, 'monitor')
  }
  if (i.categoria) {
    const g = classifyText(i.categoria)
    if (g) return result(g, 'categoria')
  }
  // Solo por nombre es una aproximación: queda a revisar (no bloquea nada).
  const g = classifyText(i.nombre)
  return g ? result(g, 'nombre', true) : result(null, 'sin_clasificar')
}

export function classifyInstrument(i: ClassifyInput): RiskResult {
  if (i.tipo_activo === 'bono') return classifyBond(i)
  if (i.tipo_activo === 'accion') return classifyStock(i)
  return classifyFund(i)
}
