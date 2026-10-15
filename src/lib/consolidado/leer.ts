// Lectura de los exports de Pershing y Morgan Stanley para la Posición
// Consolidada. Puro: recibe la grilla de celdas ya leída del .xlsx (fila 0 =
// fila 1 de Excel), detecta qué reporte es y lo normaliza. Así se prueba sin
// archivos y la pantalla no depende de cómo se leyó el Excel.

import { parseDescription, toIsoDate } from '@/lib/cupones/parse'
import type {
  ArchivoCupones, ArchivoLeido, ArchivoMovimientos, ArchivoPosiciones, Banco, Clase, ClasePago, Movimiento, Pago, Posicion, Terminos,
} from './types'

export class ArchivoError extends Error {}

type Grilla = unknown[][]

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null
  const neg = s.startsWith('(') || s.startsWith('-')
  const n = Number(s.replace(/[$,%\s()]/g, '').replace(/^-/, ''))
  if (!isFinite(n)) return null
  return neg ? -n : n
}

const blanco = (v: unknown) => {
  const s = texto(v)
  return !s || s === '-' || /^n\/?a$/i.test(s)
}

/** Fila de encabezados: la primera (en las primeras `max`) que tiene todas las columnas pedidas. */
function filaEncabezados(g: Grilla, requeridas: string[], max = 30): number {
  for (let r = 0; r < Math.min(g.length, max); r++) {
    const cells = (g[r] ?? []).map(norm)
    if (requeridas.every((h) => cells.includes(h))) return r
  }
  return -1
}

/** Índice de la primera columna cuyo encabezado coincide con alguno de los nombres. */
function columna(headers: string[], ...nombres: string[]): number {
  for (const n of nombres) {
    const i = headers.indexOf(n)
    if (i !== -1) return i
  }
  return -1
}

const MESES_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "Oct 15, 2026" / "October 15, 2026" → 2026-10-15 (sin pasar por Date, para no correr el día por zona horaria). */
function fechaEnIngles(s: string): string | null {
  const m = s.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (!m) return null
  const mes = MESES_EN[m[1].toLowerCase()]
  return mes ? `${m[3]}-${String(mes).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

const filasMeta = (g: Grilla, hasta: number) =>
  g.slice(0, Math.max(0, hasta)).map((r) => (r ?? []).map(texto).filter(Boolean).join(' ')).filter(Boolean)

// ─── Clase de activo ────────────────────────────────────────────────────────

/** A partir de la categoría que usa Pershing (fila o grupo del reporte). */
function clasePershing(categoria: string, grupo: string): Clase {
  for (const t of [categoria.toLowerCase(), grupo.toLowerCase()]) {
    if (!t || t === 'unclassified') continue
    if (/money market|money fund|cash|deposit/.test(t)) return 'Efectivo'
    if (/exchange traded|\betf\b/.test(t)) return 'ETF'
    if (/fund|unit investment trust/.test(t)) return 'Fondos'
    if (/bond|debt|fixed income|treasur|note|certificate|government|municipal|agency/.test(t)) return 'Renta fija'
    if (/stock|equit|adr|preferred|share/.test(t)) return 'Acciones'
  }
  return 'Otros'
}

/** Morgan "View Cost Basis" no trae tipo de producto: se deduce de la forma del título. */
function claseMorgan(productType: string, simbolo: string | null, nombre: string, cantidad: number | null): Clase {
  const pt = productType.toLowerCase()
  if (pt && pt !== '-') {
    if (/cash|deposit|money market|bdp/.test(pt)) return 'Efectivo'
    if (/etf|exchange[- ]traded/.test(pt)) return 'ETF'
    if (/fund/.test(pt)) return 'Fondos'
    if (/bond|fixed income|treasur|govt|government|municipal|note|cd\b|certificate/.test(pt)) return 'Renta fija'
    if (/equit|stock|adr|share/.test(pt)) return 'Acciones'
  }
  const n = nombre.toUpperCase()
  if (simbolo === 'BDPS' || /^CASH\b|BANK DEPOSIT PROGRAM|MONEY MARKET/.test(n)) return 'Efectivo'
  // Los bonos en Morgan vienen sin símbolo.
  if (!simbolo) return 'Renta fija'
  if (/\bETF\b|ISHARES|SPDR|VANECK|INVESCO QQQ|\bTRUST\b/.test(n)) return 'ETF'
  if (cantidad != null && !Number.isInteger(cantidad)) return 'Fondos'
  if (/\b(FUND|ACC|DIST|SICAV|UCITS)\b/.test(n)) return 'Fondos'
  return 'Acciones'
}

const tasaDelNombre = (s: string): number | null => {
  const m = s.match(/(\d{1,2}(?:\.\d{1,4})?)\s?%/)
  return m ? Number(m[1]) / 100 : null
}

// ─── Lotes → posición ───────────────────────────────────────────────────────

interface Lote {
  cantidad: number
  valorMercado: number
  costo: number | null
  resultado: number | null
  corrido: number | null
}

function sumarLotes(lotes: Lote[]) {
  const sumaONull = (k: 'costo' | 'resultado' | 'corrido') =>
    lotes.some((l) => l[k] != null) ? lotes.reduce((s, l) => s + (l[k] ?? 0), 0) : null
  return {
    cantidad: lotes.reduce((s, l) => s + l.cantidad, 0),
    valorMercado: lotes.reduce((s, l) => s + l.valorMercado, 0),
    costo: sumaONull('costo'),
    resultado: sumaONull('resultado'),
    corrido: sumaONull('corrido'),
  }
}

const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

/** Precio: el del archivo; si no trae, valor ÷ cantidad (bonos cotizan cada 100 nominales). */
function precioDe(precio: number | null, valor: number, cantidad: number | null, clase: Clase) {
  if (precio != null) return precio
  if (!cantidad) return null
  return clase === 'Renta fija' ? (valor / cantidad) * 100 : valor / cantidad
}

// ─── Pershing: Unrealized Gain Loss ─────────────────────────────────────────

function leerPershingPosiciones(g: Grilla, nombre: string): ArchivoPosiciones {
  const h = filaEncabezados(g, ['cusip', 'security description', 'market value'])
  if (h < 0) throw new ArchivoError('No se encontró la fila de encabezados (Cusip, Security Description, Market Value).')
  const headers = (g[h] ?? []).map(norm)
  const c = {
    desc: columna(headers, 'security description'),
    cusip: columna(headers, 'cusip'),
    qty: columna(headers, 'quantity'),
    mv: columna(headers, 'market value'),
    gl: columna(headers, 'gain/loss'),
    cost: columna(headers, 'current total cost', 'total cost'),
    cat: columna(headers, 'asset category', 'security type'),
    trade: columna(headers, 'trade date'),
    price: columna(headers, 'price', 'last price'),
    account: columna(headers, 'account'),
    accrued: columna(headers, 'accrued interest', 'accrued interest usde', 'accrued interest (usde)'),
  }

  const meta = filasMeta(g, h)
  let cuentaArchivo: string | null = null
  let fecha: string | null = null
  for (const l of meta) {
    cuentaArchivo ??= l.match(/^account\s*(?:#|number)?\s*:\s*(\S+)/i)?.[1] ?? null
    if (!fecha && /as of/i.test(l)) fecha = fechaEnIngles(l)
  }

  interface Acum { cuenta: string | null; cusip: string; desc: string; categoria: string; grupo: string; lotes: Lote[]; subtotal: Lote | null; precio: number | null }
  const porClave = new Map<string, Acum>()
  let grupo = ''
  let totalArchivo: number | null = null

  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] ?? []
    const desc = texto(row[c.desc])
    const cusip = texto(row[c.cusip])
    if (/^disclaimers?$|^disclosures?$/i.test(texto(row[0]))) break
    if (!cusip || blanco(cusip)) {
      // Encabezado de grupo ("Fixed Income", "Corporate Bonds"…) o fila de totales.
      if (desc) grupo = /^(cash|equities|fixed income|investment funds|alternative|other|options|annuit)/i.test(desc) ? desc : grupo || desc
      else if (num(row[c.mv]) != null) totalArchivo = num(row[c.mv])
      continue
    }
    const cuenta = c.account >= 0 && !blanco(row[c.account]) ? texto(row[c.account]) : cuentaArchivo
    const clave = `${cuenta ?? ''}|${cusip}`
    const lote: Lote = {
      cantidad: num(row[c.qty]) ?? 0,
      valorMercado: num(row[c.mv]) ?? 0,
      costo: c.cost >= 0 ? num(row[c.cost]) : null,
      resultado: c.gl >= 0 ? num(row[c.gl]) : null,
      corrido: c.accrued >= 0 ? num(row[c.accrued]) : null,
    }
    const acum = porClave.get(clave) ?? {
      cuenta, cusip, desc, categoria: c.cat >= 0 ? texto(row[c.cat]) : '', grupo, lotes: [], subtotal: null, precio: null,
    }
    acum.precio ??= c.price >= 0 ? num(row[c.price]) : null
    // Con varios lotes, Pershing agrega una fila resumen (Trade Date = "Multiple"):
    // se usa esa sola, sin sumarle los lotes de abajo.
    if (/^multiple$/i.test(texto(row[c.trade]))) acum.subtotal = lote
    else acum.lotes.push(lote)
    if (!acum.categoria && c.cat >= 0) acum.categoria = texto(row[c.cat])
    porClave.set(clave, acum)
  }

  const posiciones: Posicion[] = []
  for (const a of Array.from(porClave.values())) {
    const t = sumarLotes(a.subtotal ? [a.subtotal] : a.lotes)
    const clase = clasePershing(a.categoria, a.grupo)
    const info = parseDescription(a.desc)
    posiciones.push({
      banco: 'Pershing',
      cuenta: a.cuenta,
      cusip: a.cusip,
      simbolo: null,
      descripcion: a.desc,
      clase,
      categoria: a.categoria && a.categoria.toLowerCase() !== 'unclassified' ? a.categoria : a.grupo || null,
      cantidad: t.cantidad,
      precio: precioDe(a.precio, t.valorMercado, t.cantidad, clase),
      valorMercado: r2(t.valorMercado)!,
      costo: r2(t.costo),
      resultado: r2(t.resultado),
      cuponCorridoArchivo: r2(t.corrido),
      tasa: clase === 'Renta fija' ? info.rate : null,
      vencimiento: clase === 'Renta fija' ? info.maturity : null,
    })
  }
  if (!posiciones.length) throw new ArchivoError('El archivo no tiene posiciones (filas con Cusip).')

  return {
    tipo: 'posiciones', banco: 'Pershing', nombre, fecha,
    cuentas: unaCuenta(uniq(posiciones.map((p) => p.cuenta))),
    posiciones, totalArchivo, avisos: fecha ? [] : ['No se encontró la fecha ("As Of") del reporte.'],
  }
}

// ─── Morgan Stanley: Holdings (View Cost Basis / Holdings Ungrouped) ────────

function leerMorganPosiciones(g: Grilla, nombre: string): ArchivoPosiciones {
  const h = filaEncabezados(g, ['name', 'cusip', 'quantity'])
  if (h < 0) throw new ArchivoError('No se encontró la fila de encabezados (Name, CUSIP, Quantity).')
  const headers = (g[h] ?? []).map(norm)
  const c = {
    account: columna(headers, 'account number', 'account'),
    name: columna(headers, 'name'),
    symbol: columna(headers, 'symbol'),
    cusip: columna(headers, 'cusip'),
    price: columna(headers, 'last ($)', 'last'),
    qty: columna(headers, 'quantity'),
    mv: columna(headers, 'market value ($)', 'market value'),
    cost: columna(headers, 'total cost ($)', 'total cost'),
    gl: columna(headers, 'unrealized gain/loss ($)'),
    type: columna(headers, 'product type'),
    accrued: columna(headers, 'accrued interest ($)', 'accrued interest'),
    coupon: columna(headers, 'coupon rate (%)', 'coupon rate'),
    maturity: columna(headers, 'maturity date', 'maturity'),
  }

  const meta = filasMeta(g, h)
  let fecha: string | null = null
  let cuentaTitulo: string | null = null
  let totalArchivo: number | null = null
  for (const l of meta) {
    const m = l.match(/(?:cost basis|holdings) for (?:account\s+)?(.+?)\s+as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)
    if (m) {
      fecha = toIsoDate(m[2])
      if (!/^all accounts$/i.test(m[1].trim())) cuentaTitulo = m[1].trim()
    }
  }
  for (const row of g.slice(0, h)) {
    for (let i = 0; i < (row ?? []).length - 1; i++) {
      if (/^total market value:?$/i.test(texto(row[i]))) totalArchivo = num(row[i + 1])
    }
  }

  interface Acum { cuenta: string | null; cusip: string | null; nombre: string; simbolo: string | null; tipo: string; precio: number | null; tasa: number | null; vencimiento: string | null; lotes: Lote[] }
  const porClave = new Map<string, Acum>()
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] ?? []
    const nom = texto(row[c.name])
    const first = texto(row[0])
    if (/^total\b/i.test(nom) || /^total\b/i.test(first)) break
    // Sin CUSIP solo entra si tiene valor (la fila "Cash" del efectivo suelto).
    const cusip = blanco(row[c.cusip]) ? null : texto(row[c.cusip])
    if (!nom || (!cusip && num(row[c.mv]) == null)) continue
    const cuenta = c.account >= 0 && !blanco(row[c.account]) ? texto(row[c.account]) : cuentaTitulo
    const clave = `${cuenta ?? ''}|${cusip ?? nom}`
    const acum = porClave.get(clave) ?? {
      cuenta, cusip, nombre: nom,
      simbolo: c.symbol >= 0 && !blanco(row[c.symbol]) ? texto(row[c.symbol]) : null,
      tipo: c.type >= 0 ? texto(row[c.type]) : '',
      precio: num(row[c.price]),
      tasa: c.coupon >= 0 && num(row[c.coupon]) != null ? num(row[c.coupon])! / 100 : tasaDelNombre(nom),
      vencimiento: c.maturity >= 0 ? toIsoDate(row[c.maturity]) : null,
      lotes: [],
    }
    acum.lotes.push({
      cantidad: num(row[c.qty]) ?? 0,
      valorMercado: num(row[c.mv]) ?? 0,
      costo: c.cost >= 0 ? num(row[c.cost]) : null,
      resultado: c.gl >= 0 ? num(row[c.gl]) : null,
      corrido: c.accrued >= 0 ? num(row[c.accrued]) : null,
    })
    porClave.set(clave, acum)
  }

  const posiciones: Posicion[] = []
  for (const a of Array.from(porClave.values())) {
    const t = sumarLotes(a.lotes)
    const clase = claseMorgan(a.tipo, a.simbolo, a.nombre, t.cantidad)
    // El nombre del depósito viene como "BANK DEPOSIT PROGRAM | MORGAN STANLEY BANK N.A."
    const descripcion = a.nombre.replace(/\s*\|\s*/g, ' · ')
    posiciones.push({
      banco: 'Morgan Stanley',
      cuenta: a.cuenta,
      cusip: a.cusip,
      simbolo: a.simbolo,
      descripcion,
      clase,
      categoria: a.tipo && a.tipo !== '-' ? a.tipo : null,
      cantidad: t.cantidad,
      precio: clase === 'Efectivo' ? null : precioDe(a.precio, t.valorMercado, t.cantidad, clase),
      valorMercado: r2(t.valorMercado)!,
      costo: r2(t.costo),
      resultado: r2(t.resultado),
      cuponCorridoArchivo: r2(t.corrido),
      tasa: clase === 'Renta fija' ? a.tasa : null,
      vencimiento: clase === 'Renta fija' ? a.vencimiento : null,
    })
  }
  if (!posiciones.length) throw new ArchivoError('El archivo no tiene posiciones.')

  return {
    tipo: 'posiciones', banco: 'Morgan Stanley', nombre, fecha,
    cuentas: unaCuenta(uniq(posiciones.map((p) => p.cuenta))),
    posiciones, totalArchivo, avisos: fecha ? [] : ['No se encontró la fecha ("as of") del reporte.'],
  }
}

// ─── Pershing: Incoming Cash (Projected Cash Flow) ──────────────────────────

function clasePagoPershing(tipo: string): ClasePago {
  if (/BOND INT|INTEREST/.test(tipo)) return 'Cupón'
  if (/DIV/.test(tipo)) return 'Dividendo'
  return 'Otro'
}

function leerPershingCupones(g: Grilla, nombre: string): ArchivoCupones {
  const h = filaEncabezados(g, ['pay date', 'cusip'], 15)
  if (h < 0) throw new ArchivoError('No se encontró la fila de encabezados (PAY DATE, DISTRIBUTION TYPE, CUSIP…).')
  const headers = (g[h] ?? []).map(norm)
  const empieza = (p: string) => headers.findIndex((x) => x === p || x.startsWith(p + ' ') || x.startsWith(p + '('))
  const c = {
    fecha: empieza('pay date'), tipo: empieza('distribution type'), cusip: empieza('cusip'),
    desc: empieza('security description'), monto: empieza('projected cash'), asOf: empieza('as of date'), qty: empieza('quantity'),
  }
  const cuenta = /^account/i.test(texto(g[0]?.[0])) ? texto(g[0]?.[1]) || null : null

  const pagos: Pago[] = []
  let fecha: string | null = null
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] ?? []
    const f = toIsoDate(row[c.fecha])
    const cusip = texto(row[c.cusip])
    if (!f || !cusip) continue
    fecha ??= toIsoDate(row[c.asOf])
    pagos.push({
      banco: 'Pershing', cuenta, fecha: f,
      clase: clasePagoPershing(texto(row[c.tipo]).toUpperCase()),
      cusip, descripcion: texto(row[c.desc]),
      monto: num(row[c.monto]) ?? 0,
      cantidad: c.qty >= 0 ? num(row[c.qty]) : null,
    })
  }
  if (!pagos.length) throw new ArchivoError('El reporte no tiene pagos (filas con PAY DATE y CUSIP).')
  return { tipo: 'cupones', banco: 'Pershing', nombre, fecha, cuentas: cuenta ? [cuenta] : [], pagos, avisos: [] }
}

// ─── Morgan Stanley: Projected Income ───────────────────────────────────────

const MESES_LARGOS_EN: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function leerMorganCupones(g: Grilla, nombre: string): ArchivoCupones {
  const h = filaEncabezados(g, ['security', 'payment date'], 20)
  if (h < 0) throw new ArchivoError('No se encontró la fila de encabezados (Security, Payment Date, meses…).')
  const headers = (g[h] ?? []).map(norm)
  const cSec = headers.indexOf('security')
  const cPay = headers.indexOf('payment date')
  const meses = headers
    .map((x, i) => {
      const m = x.match(/^([a-z]+) (\d{4})$/)
      const mes = m ? MESES_LARGOS_EN[m[1]] : undefined
      return mes ? { i, ym: `${m![2]}-${String(mes).padStart(2, '0')}` } : null
    })
    .filter((x): x is { i: number; ym: string } => x != null)
  if (!meses.length) throw new ArchivoError('No se encontraron las columnas de meses ("October 2026"…).')

  const diasDelMes = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()
  const pagos: Pago[] = []
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] ?? []
    const sec = texto(row[cSec])
    if (!sec) continue
    if (/^total\b/i.test(sec)) break
    const proximo = toIsoDate(row[cPay])
    const dia = proximo ? Number(proximo.slice(8, 10)) : null
    for (const { i, ym } of meses) {
      const monto = num(row[i])
      if (monto == null || monto === 0) continue
      const d = Math.min(dia ?? diasDelMes(ym), diasDelMes(ym))
      pagos.push({
        banco: 'Morgan Stanley', cuenta: null, fecha: `${ym}-${String(d).padStart(2, '0')}`,
        clase: dia == null ? 'Otro' : 'Cupón', // se reclasifica al cruzarlo con la posición
        cusip: null, descripcion: sec, monto, cantidad: null, grupo: `fila${r}`,
      })
    }
  }
  if (!pagos.length) throw new ArchivoError('El reporte no tiene pagos proyectados.')
  // No trae columna de cuenta: el único indicio es el título del reporte.
  for (const l of filasMeta(g, h)) {
    if (/projected income for all accounts/i.test(l)) {
      throw new ArchivoError('es de todas las cuentas ("Projected Income for All Accounts"). Exportalo solo para la cuenta del cliente.')
    }
  }
  return { tipo: 'cupones', banco: 'Morgan Stanley', nombre, fecha: null, cuentas: [], pagos, avisos: [] }
}

// ─── Activity ───────────────────────────────────────────────────────────────

/** "RATE:BA1/BB 10.250% DUE:2028-01-10" (Morgan) o "7.125% 01/20/37" (Pershing). */
function terminosDe(desc: string, banco: Banco): Terminos | null {
  if (banco === 'Morgan Stanley') {
    const m = desc.match(/RATE:\S*\s+(\d{1,2}\.\d+)%\s+DUE:(\d{4}-\d{2}-\d{2})/)
    return m ? { tasa: Number(m[1]) / 100, vencimiento: m[2] } : null
  }
  const info = parseDescription(desc.replace(/^\d[\d,.]*\s+/, ''))
  return info.rate != null && info.maturity ? { tasa: info.rate, vencimiento: info.maturity } : null
}

function leerMovimientos(g: Grilla, nombre: string, banco: Banco): ArchivoMovimientos {
  const h = banco === 'Pershing'
    ? filaEncabezados(g, ['date', 'activity', 'activity description'])
    : filaEncabezados(g, ['activity date', 'activity', 'description'])
  if (h < 0) throw new ArchivoError('No se encontró la fila de encabezados del Activity.')
  const headers = (g[h] ?? []).map(norm)
  const c = banco === 'Pershing'
    ? {
        fecha: columna(headers, 'date'), op: columna(headers, 'trade date'), tipo: columna(headers, 'activity'),
        desc: columna(headers, 'activity description'), simbolo: columna(headers, 'symbol'), cusip: columna(headers, 'cusip'),
        qty: columna(headers, 'quantity'), precio: columna(headers, 'price'),
        monto: columna(headers, 'net amt. (base ccy)', 'net amount (base currency)', 'net amt. (trans. ccy)', 'net amount'),
        cuenta: columna(headers, 'account'),
      }
    : {
        fecha: columna(headers, 'activity date'), op: columna(headers, 'transaction date'), tipo: columna(headers, 'activity'),
        desc: columna(headers, 'description'), simbolo: columna(headers, 'symbol'), cusip: columna(headers, 'cusip'),
        qty: columna(headers, 'quantity'), precio: columna(headers, 'price($)', 'price ($)', 'price'),
        monto: columna(headers, 'amount($)', 'amount ($)', 'amount'),
        cuenta: columna(headers, 'account'),
      }

  let cuentaArchivo: string | null = null
  if (banco === 'Pershing' && /^account/i.test(texto(g[0]?.[0]))) cuentaArchivo = texto(g[0]?.[1]) || null
  if (banco === 'Morgan Stanley') {
    for (const l of filasMeta(g, h)) {
      const m = l.match(/activity for (.+?) from /i)
      if (m && !/^all accounts$/i.test(m[1].trim())) cuentaArchivo = m[1].trim()
    }
  }

  const movimientos: Movimiento[] = []
  const terminos: Record<string, Terminos> = {}
  for (let r = h + 1; r < g.length; r++) {
    const row = g[r] ?? []
    const fecha = toIsoDate(row[c.fecha])
    const tipo = texto(row[c.tipo])
    if (!fecha || !tipo) continue
    const desc = String(row[c.desc] ?? '').trim()
    const cusip = c.cusip >= 0 && !blanco(row[c.cusip]) ? texto(row[c.cusip]) : null
    let cantidad = c.qty >= 0 ? num(row[c.qty]) : null
    // Pershing pone la cantidad al principio de la descripción ("45000 FEDERATIVE REPUBLIC…").
    if (cantidad == null && banco === 'Pershing') {
      const m = texto(desc).match(/^(\d[\d,]*(?:\.\d+)?)\s+[A-Z]/)
      if (m) cantidad = num(m[1])
    }
    if (cusip && !terminos[cusip]) {
      const t = terminosDe(texto(desc), banco)
      if (t) terminos[cusip] = t
    }
    movimientos.push({
      banco,
      cuenta: c.cuenta >= 0 && !blanco(row[c.cuenta]) ? texto(row[c.cuenta]) : cuentaArchivo,
      fecha,
      fechaOperacion: c.op >= 0 ? toIsoDate(row[c.op]) : null,
      tipo: tipo.replace(/\s+/g, ' '),
      descripcion: texto(desc),
      simbolo: c.simbolo >= 0 && !blanco(row[c.simbolo]) ? texto(row[c.simbolo]) : null,
      cusip,
      cantidad: cantidad === 0 ? null : cantidad,
      precio: c.precio >= 0 && num(row[c.precio]) ? num(row[c.precio]) : null,
      monto: c.monto >= 0 ? num(row[c.monto]) : null,
    })
  }
  if (!movimientos.length) throw new ArchivoError('El Activity no tiene movimientos.')
  movimientos.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  return {
    tipo: 'movimientos', banco, nombre,
    fecha: movimientos[0].fecha,
    cuentas: unaCuenta(uniq(movimientos.map((m) => m.cuenta))),
    movimientos, terminos, avisos: [],
  }
}

// ─── Detección ──────────────────────────────────────────────────────────────

/** El consolidado es de una sola cuenta: un export con varias se rechaza. */
function unaCuenta(cuentas: string[]): string[] {
  if (cuentas.length > 1) {
    throw new ArchivoError(
      `trae ${cuentas.length} cuentas (${cuentas.join(', ')}). Exportalo solo para la cuenta del cliente.`,
    )
  }
  return cuentas
}

function uniq(xs: (string | null)[]): string[] {
  return Array.from(new Set(xs.filter((x): x is string => !!x))).sort()
}

function tieneFila(g: Grilla, pred: (cells: string[]) => boolean, max = 30) {
  for (let r = 0; r < Math.min(g.length, max); r++) if (pred((g[r] ?? []).map(norm))) return true
  return false
}

/** Identifica el reporte por su contenido (no por el nombre del archivo) y lo normaliza. */
export function leerArchivo(g: Grilla, nombre: string): ArchivoLeido {
  const primera = g.slice(0, 10).map((r) => (r ?? []).map(norm).find(Boolean) ?? '').find(Boolean) ?? ''

  if (tieneFila(g, (x) => x.includes('pay date') && x.some((v) => v.startsWith('distribution type')))) return leerPershingCupones(g, nombre)
  if (tieneFila(g, (x) => x.includes('security') && x.includes('payment date'))) return leerMorganCupones(g, nombre)
  if (tieneFila(g, (x) => x.includes('activity date') && x.includes('activity'))) return leerMovimientos(g, nombre, 'Morgan Stanley')
  if (tieneFila(g, (x) => x.includes('date') && x.includes('activity') && x.includes('activity description'))) return leerMovimientos(g, nombre, 'Pershing')
  if (primera === 'view cost basis' || primera.includes('all product type') ||
      tieneFila(g, (x) => x.includes('name') && x.includes('cusip') && x.includes('quantity'))) return leerMorganPosiciones(g, nombre)
  if (primera === 'unrealized gain loss' || tieneFila(g, (x) => x.includes('cusip') && x.includes('security description') && x.includes('market value'))) {
    return leerPershingPosiciones(g, nombre)
  }
  throw new ArchivoError(
    'No se reconoce el reporte. Se aceptan: Unrealized Gain Loss, Activity e Incoming Cash de Pershing; Holdings - Cost Basis, Activity y Projected Income de Morgan Stanley.',
  )
}
