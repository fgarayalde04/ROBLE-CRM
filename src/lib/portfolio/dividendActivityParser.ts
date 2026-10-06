/**
 * Parser de Activity para la planilla de dividendos — hermano de
 * activityParser.ts (misma técnica: detecta la fila de encabezados por
 * contenido, no por posición fija, y mapea nombres de columna equivalentes
 * en español/inglés). No reutiliza el mismo archivo porque
 * portfolio_activity/portfolio_activity_imports tiene semántica de
 * "reemplazar el último snapshot" (borra e inserta de nuevo por
 * account+as_of_date+custodian), que no encaja con un ledger que nunca debe
 * duplicar movimientos ya cargados en visitas anteriores.
 *
 * Además de las columnas de activityParser, reconoce ISIN, moneda, cuenta y
 * custodio, y clasifica cada fila en compra/venta/dividendo por palabras
 * clave — nunca asume el layout de un custodio en particular.
 */
import * as XLSX from 'xlsx'
import { parseDateStr, parseNum, parseStr } from '@/lib/factsheet-parser'

export type DividendTxnType = 'compra' | 'venta' | 'dividendo'

export interface ParsedActivityRow {
  date: string | null // YYYY-MM-DD
  fundName: string
  isin: string | null
  symbol: string | null
  cusip: string | null
  type: DividendTxnType | null // null = no es compra/venta/dividendo, se ignora
  rawActivityType: string | null
  amount: number | null
  quantity: number | null
  price: number | null
  currency: string | null
  account: string | null
  custodian: string | null
}

export interface ParsedDividendActivity {
  rows: ParsedActivityRow[]
  ignoredCount: number // filas leídas que no son compra/venta/dividendo (fees, interest, transfers, etc.)
  warnings: string[]
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[()$/.,:]/g, ' ').replace(/\s+/g, ' ').trim()

type Field = 'date' | 'fundName' | 'isin' | 'symbol' | 'cusip' | 'activityType' | 'amount' | 'quantity' | 'price' | 'currency' | 'account' | 'custodian'

const ALIASES: Record<Field, string[]> = {
  date:         ['trade date', 'date', 'activity date', 'transaction date', 'process date', 'entry date', 'as of date', 'posted date', 'fecha'],
  fundName:     ['security', 'security description', 'description', 'fund', 'fondo', 'name', 'security name', 'investment', 'activity description'],
  isin:         ['isin', 'isin code'],
  symbol:       ['symbol', 'ticker'],
  cusip:        ['cusip'],
  activityType: ['activity', 'activity type', 'transaction type', 'type', 'transaction', 'action', 'tipo'],
  // "net amount base currency" (Pershing: "Net Amount (Base Currency)") es
  // el único alias de monto en la moneda base de la cuenta — a propósito NO
  // se agrega "net amount transaction currency" como alias de amount, para
  // que en cuentas con movimientos en moneda extranjera siempre se tome el
  // monto ya convertido a la moneda base, nunca el de la moneda original.
  amount:       ['amount', 'net amount', 'net amt', 'net amt trans ccy', 'net amount trans ccy', 'net amount base currency', 'transaction amount', 'net cash', 'value', 'credit debit', 'gross amount', 'total amount', 'monto'],
  quantity:     ['quantity', 'shares', 'qty', 'units', 'cantidad'],
  price:        ['price', 'unit price', 'trade price', 'precio'],
  currency:     ['currency', 'ccy', 'base ccy', 'base currency', 'moneda'],
  account:      ['account', 'account number', 'account #', 'cuenta'],
  custodian:    ['custodian', 'custodio'],
}

function matchCol(header: string): Field | null {
  const h = norm(header)
  for (const [field, names] of Object.entries(ALIASES)) {
    if (names.some(n => n === h)) return field as Field
  }
  return null
}

// Compra/venta/dividendo por palabras clave — nunca asume que todos los
// exports usan los mismos nombres (Buy/Purchase, Sell/Sale,
// Dividend/Distribution/Income/Cash Dividend, y sus equivalentes en español).
export function classifyActivityType(activityType: string | null, description: string | null): DividendTxnType | null {
  const t = norm((activityType ?? '') + ' ' + (description ?? ''))
  // Cupones de bonos (Pershing: "BOND INTEREST RECEIVED", "FOREIGN BOND
  // INTEREST") cuentan como cobro, igual que un dividendo. El interés de
  // depósitos/sweep ("DEPOSITS INTEREST RECEIVED") no es un bono y se ignora.
  if (isBondCouponActivity(activityType, description)) return 'dividendo'
  if (/dividend|distribution|\bincome\b|cash div|dividendo|distribuci[oó]n/.test(t)) return 'dividendo'
  if (/\bbuy\b|purchase|\bcompra\b/.test(t)) return 'compra'
  if (/\bsell\b|\bsale\b|\bventa\b/.test(t)) return 'venta'
  return null
}

export function isBondCouponActivity(activityType: string | null, description: string | null): boolean {
  return /bond interest|coupon|cup[oó]n/.test(norm((activityType ?? '') + ' ' + (description ?? '')))
}

// ISIN de un CUSIP norteamericano: "US" + CUSIP + dígito verificador (Luhn
// sobre los caracteres convertidos a números, A=10…Z=35). Pershing usa este
// mismo ISIN en el Excel de posiciones, así el bono cruza con su posición.
export function isinFromCusip(cusip: string): string | null {
  const c = cusip.trim().toUpperCase()
  if (!/^[0-9A-Z]{8}[0-9]$/.test(c) || /^PER/.test(c)) return null
  const body = 'US' + c
  const digits = body.split('').map(ch => /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)).join('')
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return body + String((10 - (sum % 10)) % 10)
}

// La descripción de Pershing cambia en cada pago ("45000 FEDERATIVE REPUBLIC
// OF BRAZIL … REGDTD 01/18/06 RD 07/17 PD 07/20/26", "VONTOBEL … 127.0220
// SHRS RD 09/19 PD 09/27/24") — se limpia la cantidad, las fechas de
// registro/pago y el "dated date" para que todos los cobros del mismo
// instrumento queden con el mismo nombre.
export function cleanActivitySecurityName(desc: string): { name: string; leadingQuantity: number | null } {
  let s = desc.replace(/\s+/g, ' ').trim()
  let leadingQuantity: number | null = null
  const lead = s.match(/^([\d,]+(?:\.\d+)?)\s+(?:SHRS\s+)?(?=[A-Za-z])/)
  if (lead) { leadingQuantity = Number(lead[1].replace(/,/g, '')); s = s.slice(lead[0].length) }
  s = s.replace(/\s+RD\s+\d{1,2}\/\d{1,2}\s+PD\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*$/i, '')
  s = s.replace(/\s+\S*DTD\b.*$/i, '')
  s = s.replace(/\s+[\d,]+(?:\.\d+)?\s+SHRS\b.*$/i, '')
  s = s.replace(/\s+FOR ACCRUAL PERIOD ENDING\b.*$/i, '')
  s = s.replace(/\s+SHRS$/i, '')
  s = s.replace(/\s+ISIN\s*#?\s*[A-Z]{2}[0-9A-Z]{9}[0-9]/i, '')
  return { name: s.trim() || desc.trim(), leadingQuantity }
}

export function parseDividendActivityExcel(buffer: ArrayBuffer, isCsv: boolean): ParsedDividendActivity {
  const wb = isCsv
    ? XLSX.read(new TextDecoder().decode(buffer), { type: 'string' })
    : XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][]
  if (!raw || raw.length < 2) return { rows: [], ignoredCount: 0, warnings: ['Archivo vacío o sin datos'] }

  let headerIdx = -1
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const cols = (raw[i] as unknown[]).map(c => matchCol(String(c))).filter(Boolean)
    const hasDate = cols.includes('date')
    const hasAmount = cols.includes('amount')
    if (hasDate && hasAmount && cols.length >= 3) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    return { rows: [], ignoredCount: 0, warnings: ['No se encontró una fila de encabezados reconocible (se necesita una columna de fecha y una de monto)'] }
  }

  const headers = (raw[headerIdx] as unknown[]).map(h => String(h))
  const colIdx: Partial<Record<Field, number>> = {}
  headers.forEach((h, i) => {
    const f = matchCol(h)
    if (f && colIdx[f] == null) colIdx[f] = i
  })
  const get = (row: unknown[], f: Field) => (colIdx[f] != null ? row[colIdx[f]!] : undefined)
  const isBlank = (s: string | null) => s == null || s === '' || s === '-' || s.toUpperCase() === 'N/A'

  const rows: ParsedActivityRow[] = []
  let ignoredCount = 0
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const desc = parseStr(get(row, 'fundName'))
    const type = parseStr(get(row, 'activityType'))
    const date = parseDateStr(get(row, 'date'))
    const amount = parseNum(get(row, 'amount'))
    const firstCell = norm(row[0])
    if (!desc && !type && date == null && amount == null) continue
    if (/^total\b|^grand total\b|^disclosure|^disclaimer/.test(firstCell)) break
    if (date == null && amount == null) continue

    const classified = classifyActivityType(type, desc)
    if (!classified) { ignoredCount++; continue }

    const isinCol = parseStr(get(row, 'isin'))
    const symbol = parseStr(get(row, 'symbol'))
    const cusip = parseStr(get(row, 'cusip'))
    const isCoupon = isBondCouponActivity(type, desc)
    const cleaned = desc ? cleanActivitySecurityName(desc) : null
    // ISIN: columna del archivo, si no el que viene en la descripción
    // ("ISIN#US105756BK57"), y para cupones el derivado del CUSIP — así
    // todos los cupones del mismo bono se agrupan aunque la descripción no
    // traiga ISIN.
    const isinInDesc = desc?.match(/ISIN\s*#?\s*([A-Z]{2}[0-9A-Z]{9}[0-9])/i)?.[1] ?? null
    const isin = !isBlank(isinCol) ? isinCol : isinInDesc ?? (isCoupon && cusip && !isBlank(cusip) ? isinFromCusip(cusip) : null)
    const currency = parseStr(get(row, 'currency'))
    const account = parseStr(get(row, 'account'))
    const custodian = parseStr(get(row, 'custodian'))
    rows.push({
      date,
      fundName: (cleaned?.name ?? type ?? '—').replace(/\s+/g, ' ').trim(),
      isin: isBlank(isin) ? null : isin!.toUpperCase(),
      symbol: isBlank(symbol) ? null : symbol,
      cusip: isBlank(cusip) ? null : cusip,
      type: classified,
      rawActivityType: type,
      // Pershing trae las compras en negativo (salida de caja) — el capital
      // invertido se reconstruye con montos positivos.
      amount: amount != null && (classified === 'compra' || classified === 'venta') ? Math.abs(amount) : amount,
      // En cupones el nominal viene al principio de la descripción ("45000 …").
      quantity: parseNum(get(row, 'quantity')) ?? (isCoupon ? cleaned?.leadingQuantity ?? null : null),
      price: parseNum(get(row, 'price')),
      currency: isBlank(currency) ? null : currency!.toUpperCase(),
      account: isBlank(account) ? null : account,
      custodian: isBlank(custodian) ? null : custodian,
    })
  }

  rows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const warnings = rows.length === 0 ? ['No se encontraron movimientos de compra, venta o dividendo en el archivo'] : []
  return { rows, ignoredCount, warnings }
}
