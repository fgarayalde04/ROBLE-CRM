// Shared visual language for the Portfolio Report — used by both the live
// dashboard (ResumenTab/PositionsTab) and the static PDF (AccountPdfReport),
// so the two never drift apart.

export const COLORS = {
  darkGreen: '#1B3A2B',
  midGreen: '#2E7D52',
  softGreen: '#4CAF72',
  paleGreen: '#81C995',
  mintGreen: '#C8E6C9',
  charcoal: '#1B2E3C',
  ink: '#111827',
  slate: '#6B7280',
  mutedSlate: '#9CA3AF',
  border: '#E2E8F0',
  bgSoft: '#F7F9FB',
  bgSofter: '#F3F4F6',
  white: '#FFFFFF',
  gain: '#15803D',
  gainSoft: '#DCFCE7',
  loss: '#B91C1C',
  lossSoft: '#FEE2E2',
}

// Distinct, on-brand donut/legend palette — dark green through pale, then
// charcoal + slate for anything past the core "green family".
export const DONUT_COLORS = ['#1B3A2B', '#2E7D52', '#4CAF72', '#81C995', '#1B2E3C', '#9CA3AF', '#C8E6C9']

export const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const fmtUSD2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
export const fmtPct = (n: number, decimals = 1) => `${n.toFixed(decimals)}%`

// ── Clean, client-facing display names ──────────────────────────────────────
// Source descriptions are custodian exports: long, ALL-CAPS, packed with
// ISIN/CUSIP/date codes. We keep the original untouched in the data — this
// only affects what's shown to the client.

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    // keep common all-caps tokens readable
    .replace(/\bSa\b/g, 'SA').replace(/\bUsd\b/g, 'USD').replace(/\bEtf\b/g, 'ETF')
    .replace(/\bJpmorgan\b/g, 'JPMorgan').replace(/\bDnca\b/g, 'DNCA')
}

export interface CleanName { name: string; detail: string | null }

export function cleanDisplayName(rawName: string, isin: string | null, cusip: string | null, coupon: string | number | null, maturityDate: string | null): CleanName {
  const isBond = maturityDate != null

  if (isBond) {
    // "TECPETROL SA ISIN#USP90187AT55 7.625% 11/03/30 B/E DTD..." → "Tecpetrol 7.625% 2030"
    const issuerRaw = rawName.split(/\s+ISIN|\s+\d/)[0].replace(/\bSA\b/i, '').trim()
    const issuer = titleCase(issuerRaw).trim() || titleCase(rawName.split(' ').slice(0, 2).join(' '))
    const couponNum = coupon != null ? Number(coupon) : null
    const year = maturityDate.slice(0, 4)
    const couponLabel = couponNum != null && couponNum > 0 ? `${couponNum.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}% ` : ''
    return {
      name: `${issuer} ${couponLabel}${year}`.replace(/\s+/g, ' ').trim(),
      detail: isin ? `ISIN ${isin}` : cusip ? `CUSIP ${cusip}` : null,
    }
  }

  // Funds: strip share-class / currency-hedge boilerplate and any trailing
  // "ISIN xxx" the custodian appended into the description itself.
  const cleaned = rawName
    .replace(/\s*ISIN[#\s]*[A-Z0-9]{6,}\s*$/i, '')
    .replace(/\s*\((ACC|INC|DIST|HDG|USD|EUR)\)\s*/gi, ' ')
    .replace(/\bCLASS\s+[A-Z0-9/]+\b/gi, '')
    .replace(/\bFUND\b/gi, 'Fund')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { name: titleCase(cleaned), detail: isin ? `ISIN ${isin}` : cusip ? `CUSIP ${cusip}` : null }
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`
}
