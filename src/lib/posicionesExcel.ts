import * as XLSX from 'xlsx'
import type { FilaPosicion } from '@/lib/db/clientPositions'

// ─── Lectura del Excel de posiciones ─────────────────────────────────────────
// Acepta cualquier export con una fila de encabezados: se detectan las
// columnas por nombre (cuenta, nombre/descripción, tipo, símbolo, CUSIP, ISIN,
// cantidad, valor de mercado). Si el archivo es de una sola cuenta y no trae
// columna de cuenta, se toma del título ("Holdings for Account X - 1234") o se
// escribe a mano.

const COLS: Record<keyof FilaPosicion, RegExp> = {
  account:  /^(account( number| no\.?| #| id)?|acct( no\.?| #)?|cuenta|n(ro|°|º)\.? ?(de )?cuenta)$/i,
  nombre:   /^(name|description|security description|security name|security|descripci[oó]n|nombre|instrumento)$/i,
  producto: /(product type|asset type|security type|asset class|tipo( de)? (activo|producto))/i,
  symbol:   /^(symbol|ticker|s[ií]mbolo)/i,
  cusip:    /cusip/i,
  isin:     /isin/i,
  cantidad: /^(quantity|qty|cantidad|shares|units|par( value)?|face( value)?|nominal)/i,
  monto:    /(market value|mkt\.? val|valor de mercado|valor mercado|market val)/i,
  rating:   /(rating|calificaci[oó]n|s&p|moody)/i,
  vencimiento: /^(maturity( date)?|vencimiento|fecha de vencimiento)$/i,
}

export interface Lectura { filas: FilaPosicion[]; sinCuenta: boolean; cuentaTitulo: string | null; columnas: string[] }

export function leerExcel(buf: ArrayBuffer): Lectura | null {
  const wb = XLSX.read(buf, { type: 'array' })
  for (const name of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][]
    let headerIdx = -1
    let idx: Partial<Record<keyof typeof COLS, number>> = {}
    for (let i = 0; i < Math.min(raw.length, 40); i++) {
      const cells = (raw[i] ?? []).map((c: any) => String(c ?? '').trim())
      const found: typeof idx = {}
      cells.forEach((c, j) => {
        for (const [k, re] of Object.entries(COLS) as [keyof typeof COLS, RegExp][]) {
          if (found[k] == null && c && re.test(c)) found[k] = j
        }
      })
      if (found.nombre != null && (found.monto != null || found.cantidad != null)) { headerIdx = i; idx = found; break }
    }
    if (headerIdx < 0) continue

    // Cuenta en el título (exports de una sola cuenta)
    let cuentaTitulo: string | null = null
    for (let i = 0; i < headerIdx; i++) {
      const t = (raw[i] ?? []).map((c: any) => String(c ?? '')).join(' ')
      const m = t.match(/account\s+(.+?)\s+as of/i) ?? t.match(/(?:account|cuenta)[:#\s]+([A-Z0-9-]{4,})/i)
      if (m) { cuentaTitulo = m[1].split(/\s+-\s+/).pop()!.trim(); break }
    }

    const get = (r: any[], k: keyof typeof COLS) => (idx[k] != null ? r[idx[k]!] : null)
    const ratingCols = (raw[headerIdx] ?? [])
      .map((c: any, j: number) => (COLS.rating.test(String(c ?? '').trim()) ? j : -1))
      .filter((j: number) => j >= 0)
    const filas: FilaPosicion[] = []
    for (let i = headerIdx + 1; i < raw.length; i++) {
      const r = raw[i] ?? []
      const nombre = String(get(r, 'nombre') ?? '').trim()
      if (!nombre || /^(total|subtotal)\b/i.test(nombre)) continue
      const monto = get(r, 'monto'), cantidad = get(r, 'cantidad')
      if ((monto === '' || monto == null) && (cantidad === '' || cantidad == null)) continue   // pie de página / disclosures
      filas.push({
        account: String(get(r, 'account') ?? '').trim(),
        nombre,
        producto: String(get(r, 'producto') ?? '').trim() || null,
        symbol: String(get(r, 'symbol') ?? '').trim() || null,
        cusip: String(get(r, 'cusip') ?? '').trim() || null,
        isin: String(get(r, 'isin') ?? '').trim() || null,
        cantidad: typeof cantidad === 'number' ? cantidad : String(cantidad ?? '').trim() || null,
        monto: typeof monto === 'number' ? monto : String(monto ?? '').trim() || null,
        // Puede haber varias columnas de rating (Moody's, S&P, Fitch): se juntan y
        // el clasificador toma la más baja.
        rating: ratingCols.map(j => String(r[j] ?? '').trim()).filter(v => v && v !== '-' && !/^n\/?r$/i.test(v)).join(' / ') || null,
        vencimiento: String(get(r, 'vencimiento') ?? '').trim().replace(/^-$/, '') || null,
      })
    }
    const columnas = Object.keys(idx)
    return { filas, sinCuenta: idx.account == null, cuentaTitulo, columnas }
  }
  return null
}

