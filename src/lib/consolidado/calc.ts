// Armado de la Posición Consolidada a partir de los archivos ya leídos de cada
// banco: posiciones con su cupón corrido, totales por banco y por clase,
// renta de los próximos 12 meses y movimientos. Puro: lo usan la pantalla, la
// impresión y el Excel, así los tres muestran los mismos números.

import { inferFrequency, parseDescription } from '@/lib/cupones/parse'
import {
  BANCOS, CLASES,
  type ArchivoCupones, type ArchivoLeido, type ArchivoMovimientos, type ArchivoPosiciones, type ArchivoRendimiento, type Banco, type Clase, type ClasePago,
  type Movimiento, type Pago, type Posicion, type Terminos, type TipoArchivo,
} from './types'

/**
 * Archivos por cuenta: clave "banco|tipo" para la primera cuenta de cada banco
 * (así siguen valiendo los consolidados guardados antes) y "banco|tipo|n" para
 * la segunda en adelante (n = 1, 2…). Un cliente puede tener varias cuentas en
 * el mismo custodio: cada una con su reporte de posiciones, su calendario de
 * cupones y su Activity.
 */
export type Archivos = Partial<Record<string, ArchivoLeido>>
export const claveArchivo = (banco: Banco, tipo: TipoArchivo, n = 0) => (n ? `${banco}|${tipo}|${n}` : `${banco}|${tipo}`)

/** Una cuenta del consolidado: banco + número de orden dentro del banco. */
export interface Ranura { banco: Banco; n: number; clave: string }
export const claveRanura = (banco: Banco, n: number) => `${banco}|${n}`

export function leerClave(k: string): { banco: Banco; tipo: TipoArchivo; n: number } | null {
  const [banco, tipo, n] = k.split('|')
  if (!BANCOS.includes(banco as Banco)) return null
  return { banco: banco as Banco, tipo: tipo as TipoArchivo, n: n ? Number(n) : 0 }
}

/** Cuentas con al menos un archivo, ordenadas por banco y número. */
export function ranurasDe(archivos: Archivos): Ranura[] {
  const vistas = new Map<string, Ranura>()
  for (const k of Object.keys(archivos)) {
    const c = leerClave(k)
    if (!c || !archivos[k]) continue
    vistas.set(claveRanura(c.banco, c.n), { banco: c.banco, n: c.n, clave: claveRanura(c.banco, c.n) })
  }
  return Array.from(vistas.values()).sort((a, b) => BANCOS.indexOf(a.banco) - BANCOS.indexOf(b.banco) || a.n - b.n)
}

/** "Pershing" si es la única cuenta del banco; si no "Pershing 1", "Pershing 2"… o el nombre que se le puso. */
export function etiquetaRanura(r: Pick<Ranura, 'banco' | 'n' | 'clave'>, ranuras: Pick<Ranura, 'banco'>[], nombres: Record<string, string> = {}) {
  const propio = nombres[r.clave]?.trim()
  if (propio) return propio
  return ranuras.filter((x) => x.banco === r.banco).length > 1 ? `${r.banco} ${r.n + 1}` : r.banco
}

export type FuenteCorrido = 'archivo' | 'manual' | 'calendario' | 'tasa' | 'sin datos'

export interface LineaPosicion extends Posicion {
  /** Cuenta del consolidado a la que pertenece (claveRanura) y cómo se la muestra. */
  ranura: string
  etiquetaCuenta: string
  /** Nombre legible para el cliente ("YPF 8.25% 2034") y línea de detalle (CUSIP · cupón · vencimiento). */
  nombre: string
  detalle: string
  perpetuo: boolean
  cuponCorrido: number
  fuenteCorrido: FuenteCorrido | null
  /** Valor de mercado + cupón corrido. */
  total: number
  /** Sobre el total consolidado (con cupón corrido). */
  peso: number
}

export interface Subtotal {
  valorMercado: number
  cuponCorrido: number
  total: number
  costo: number
  resultado: number
  peso: number
  cantidad: number
}

export interface FilaRenta {
  banco: Banco
  etiquetaCuenta: string
  cuenta: string | null
  cusip: string | null
  descripcion: string
  clase: ClasePago
  montos: number[]
  total: number
}

export interface CategoriaMovimiento {
  categoria: string
  cantidad: number
  monto: number
}

export interface Reporte {
  fecha: string
  bancos: Banco[]
  posiciones: LineaPosicion[]
  totales: Subtotal
  porBanco: (Subtotal & { banco: Banco })[]
  /** Una entrada por cuenta (si hay una sola por banco, es igual a porBanco). */
  porCuenta: (Subtotal & { ranura: string; banco: Banco; etiqueta: string })[]
  porClase: (Subtotal & { clase: Clase })[]
  renta: {
    meses: string[] // YYYY-MM
    filas: FilaRenta[]
    porBanco: { banco: Banco; montos: number[]; total: number }[]
    montos: number[]
    total: number
    cupones: number
    dividendos: number
  }
  movimientos: (Movimiento & { etiquetaCuenta: string })[]
  resumenMovimientos: CategoriaMovimiento[]
  periodoMovimientos: { desde: string | null; hasta: string | null }
  /** Rendimiento informado por el banco, por cuenta (no se suman: cada cuenta tiene el suyo). */
  rendimiento: (ArchivoRendimiento & { etiquetaCuenta: string })[]
  /** Cupones y dividendos cobrados en el período del Activity, por instrumento. */
  cobrados: {
    filas: { nombre: string; banco: Banco; etiquetaCuenta: string; cupones: number; dividendos: number; total: number }[]
    cupones: number
    dividendos: number
    total: number
  }
  avisos: string[]
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

function sumarMeses(iso: string, n: number) {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  const dias = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  const d = Math.min(Number(iso.slice(8, 10)), dias)
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Días entre dos fechas en base 30/360 (la de los bonos corporativos y soberanos en USD). */
function dias30360(a: string, b: string) {
  const [y1, m1, d1] = [Number(a.slice(0, 4)), Number(a.slice(5, 7)), Number(a.slice(8, 10))]
  const [y2, m2, d2] = [Number(b.slice(0, 4)), Number(b.slice(5, 7)), Number(b.slice(8, 10))]
  const D1 = Math.min(d1, 30)
  const D2 = d2 === 31 && D1 === 30 ? 30 : d2
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (D2 - D1)
}

/** Cupón corrido = cupón del período × fracción transcurrida desde el último pago. */
function corrido(cuponPeriodo: number, proximo: string, frecuencia: number, fecha: string) {
  const ultimo = sumarMeses(proximo, -12 / frecuencia)
  const periodo = dias30360(ultimo, proximo)
  if (periodo <= 0) return 0
  const frac = Math.min(1, Math.max(0, dias30360(ultimo, fecha) / periodo))
  return cuponPeriodo * frac
}

const r2 = (n: number) => Math.round(n * 100) / 100
const normNombre = (s: string) => s.toUpperCase().replace(/\s*[|·]\s*.*$/, '').replace(/[^A-Z0-9%.]+/g, ' ').trim()

// ─── Cupón corrido ──────────────────────────────────────────────────────────

/** Pershing: pagos del Incoming Cash por CUSIP (y cuenta). */
function corridoPershing(p: Posicion, pagos: Pago[], fecha: string): number | null {
  const propios = pagos
    .filter((x) => x.clase === 'Cupón' && x.cusip === p.cusip && (!x.cuenta || !p.cuenta || x.cuenta === p.cuenta))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const proximo = propios.find((x) => x.fecha > fecha)
  if (!proximo) return null
  let frecuencia: number | null = inferFrequency(propios.map((x) => x.fecha))
  if (frecuencia == null) {
    // Un solo pago en el año: anual, salvo que el bono venza dentro de ese año.
    frecuencia = p.vencimiento && p.vencimiento <= sumarMeses(fecha, 12) ? 2 : 1
  }
  const escala = proximo.cantidad && p.cantidad ? p.cantidad / proximo.cantidad : 1
  return corrido(proximo.monto * escala, proximo.fecha, frecuencia, fecha)
}

interface GrupoMorgan {
  id: string
  nombre: string
  pagos: Pago[]
  frecuencia: number
}

/**
 * Morgan: el Projected Income viene por nombre de título (sin CUSIP) y con
 * todas las cuentas sumadas. Cada fila se asigna a un CUSIP de las posiciones
 * con el mismo nombre; si hay varios (dos bonos de YPF), se desempata por el
 * día de pago contra el vencimiento y por la tasa implícita.
 */
function asignarGruposMorgan(
  pagos: Pago[], posiciones: Posicion[], terminos: Record<string, Terminos>,
): { porCusip: Map<string, GrupoMorgan>; sinAsignar: GrupoMorgan[]; cantidadTotal: Map<string, number> } {
  const grupos = new Map<string, GrupoMorgan>()
  for (const x of pagos) {
    const id = x.grupo ?? x.descripcion
    const g = grupos.get(id) ?? { id, nombre: normNombre(x.descripcion), pagos: [], frecuencia: 0 }
    g.pagos.push(x)
    grupos.set(id, g)
  }
  for (const g of Array.from(grupos.values())) {
    g.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha))
    const limite = sumarMeses(g.pagos[0].fecha.slice(0, 8) + '01', 12)
    g.frecuencia = g.pagos.filter((x) => x.fecha < limite).length
  }

  // Cantidad total por CUSIP en el archivo (todas las cuentas), para repartir.
  const cantidadTotal = new Map<string, number>()
  const cusipsPorNombre = new Map<string, Set<string>>()
  for (const p of posiciones) {
    if (!p.cusip) continue
    cantidadTotal.set(p.cusip, (cantidadTotal.get(p.cusip) ?? 0) + (p.cantidad ?? 0))
    const n = normNombre(p.descripcion)
    const set = cusipsPorNombre.get(n) ?? new Set<string>()
    set.add(p.cusip)
    cusipsPorNombre.set(n, set)
  }

  const tasaDe = (cusip: string) => terminos[cusip]?.tasa ?? posiciones.find((p) => p.cusip === cusip)?.tasa ?? null
  const vtoDe = (cusip: string) => terminos[cusip]?.vencimiento ?? posiciones.find((p) => p.cusip === cusip)?.vencimiento ?? null

  const porCusip = new Map<string, GrupoMorgan>()
  const sinAsignar: GrupoMorgan[] = []
  const porNombre = new Map<string, GrupoMorgan[]>()
  for (const g of Array.from(grupos.values())) porNombre.set(g.nombre, [...(porNombre.get(g.nombre) ?? []), g])

  for (const [nombre, gs] of Array.from(porNombre.entries())) {
    const cusips = Array.from(cusipsPorNombre.get(nombre) ?? [])
    if (!cusips.length) { sinAsignar.push(...gs); continue }
    if (gs.length === 1 && cusips.length === 1) { porCusip.set(cusips[0], gs[0]); continue }

    const pares: { g: GrupoMorgan; c: string; score: number }[] = []
    for (const g of gs) {
      const primero = g.pagos[0]
      for (const c of cusips) {
        let score = 0
        const vto = vtoDe(c)
        if (vto && Number(vto.slice(8, 10)) === Number(primero.fecha.slice(8, 10))) {
          const paso = 12 / Math.max(1, g.frecuencia)
          const dif = (Number(vto.slice(5, 7)) - Number(primero.fecha.slice(5, 7)) + 12) % 12
          if (dif % paso === 0) score += 3
        }
        const qty = cantidadTotal.get(c) ?? 0
        const implicita = qty > 0 ? (primero.monto * g.frecuencia) / qty : null
        const tasa = tasaDe(c)
        if (implicita != null && tasa != null && Math.abs(implicita - tasa) < 0.0015) score += 2
        if (score > 0) pares.push({ g, c, score })
      }
    }
    pares.sort((a, b) => b.score - a.score)
    const usados = new Set<string>()
    for (const { g, c, score } of pares) {
      if (score < 2 || usados.has(g.id) || porCusip.has(c)) continue
      porCusip.set(c, g)
      usados.add(g.id)
    }

    // Lo que queda: se asigna solo si hay una única combinación con una tasa
    // implícita creíble (múltiplo de 1/8 % y entre 0,5 % y 20 %). Si dos bonos
    // del mismo nombre y misma cantidad pueden ir con cualquiera de los pagos,
    // quedan sin asignar antes que adivinar.
    const creible = (g: GrupoMorgan, c: string) => {
      const qty = cantidadTotal.get(c) ?? 0
      if (!qty || g.frecuencia < 1) return false
      const tasa = (g.pagos[0].monto * g.frecuencia) / qty
      if (tasa < 0.005 || tasa > 0.2) return false
      const octavos = tasa * 800
      // Los montos del Projected Income vienen redondeados al dólar.
      const tolerancia = (g.frecuencia * 800) / qty + 0.02
      return Math.abs(octavos - Math.round(octavos)) <= tolerancia
    }
    for (let cambio = true; cambio; ) {
      cambio = false
      const libresG = gs.filter((g) => !usados.has(g.id))
      const libresC = cusips.filter((c) => !porCusip.has(c))
      for (const g of libresG) {
        const cands = libresC.filter((c) => creible(g, c))
        if (cands.length !== 1) continue
        const c = cands[0]
        if (libresG.filter((o) => creible(o, c)).length !== 1) continue
        porCusip.set(c, g)
        usados.add(g.id)
        cambio = true
        break
      }
    }
    // Un solo pago y un solo bono sin asignar: van juntos si la tasa es razonable.
    const restoG = gs.filter((g) => !usados.has(g.id))
    const restoC = cusips.filter((c) => !porCusip.has(c))
    if (restoG.length === 1 && restoC.length === 1) {
      const qty = cantidadTotal.get(restoC[0]) ?? 0
      const tasa = qty ? (restoG[0].pagos[0].monto * restoG[0].frecuencia) / qty : 0
      if (tasa >= 0.01 && tasa <= 0.2) {
        porCusip.set(restoC[0], restoG[0])
        usados.add(restoG[0].id)
      }
    }
    for (const g of gs) if (!usados.has(g.id)) sinAsignar.push(g)
  }
  return { porCusip, sinAsignar, cantidadTotal }
}

function corridoMorgan(p: Posicion, grupo: GrupoMorgan | undefined, cantidadTotal: number, fecha: string): number | null {
  if (!grupo || !p.cantidad || !cantidadTotal || grupo.frecuencia < 1) return null
  const proximo = grupo.pagos.find((x) => x.fecha > fecha)
  if (!proximo) return null
  return corrido(proximo.monto * (p.cantidad / cantidadTotal), proximo.fecha, grupo.frecuencia, fecha)
}

/** Sin calendario: cupón semestral con fechas de pago tomadas del vencimiento. */
function corridoPorTasa(p: Posicion, t: Terminos | undefined, fecha: string): number | null {
  const tasa = p.tasa ?? t?.tasa ?? null
  const vto = p.vencimiento ?? t?.vencimiento ?? null
  return corridoEstimado(p.cantidad, tasa, vto, fecha)
}

/** Cupón corrido con tasa y vencimiento, suponiendo cupón semestral (30/360). */
export function corridoEstimado(cantidad: number | null, tasa: number | null, vto: string | null, fecha: string): number | null {
  if (tasa == null || !cantidad) return null
  if (tasa === 0) return 0
  if (!vto || vto <= fecha) return null
  let proximo = vto
  for (let i = 0; i < 400; i++) {
    const anterior = sumarMeses(vto, -6 * (i + 1))
    if (anterior <= fecha) break
    proximo = anterior
  }
  return corrido((cantidad * tasa) / 2, proximo, 2, fecha)
}

// ─── Movimientos ────────────────────────────────────────────────────────────

export function categoriaMovimiento(m: Movimiento): string {
  const t = `${m.tipo} ${m.descripcion}`.toUpperCase()
  if (/CANCEL/.test(m.tipo.toUpperCase())) return 'Cancelaciones'
  if (/MONEY (MARKET )?FUND|MMF|SWEEP|BANK DEPOSIT/.test(t) && !/INTEREST INCOME|DIVIDEND/.test(m.tipo.toUpperCase())) return 'Money market'
  if (/WITHHOLD|\bTAX\b/.test(t)) return 'Impuestos'
  if (/\bFEE\b|COMMISSION|PERFORMANCE|ADVISORY|MAINTENANCE/.test(t)) return 'Comisiones y gastos'
  if (/^(BOUGHT|BUY|PURCHASE)|BOUGHT|PURCHASE/.test(m.tipo.toUpperCase())) return 'Compras'
  if (/^(SOLD|SELL)|SOLD|REDEMPTION|REDEEMED|MATURITY|CALLED/.test(m.tipo.toUpperCase())) return 'Ventas y vencimientos'
  if (/INTEREST|BOND INT/.test(m.tipo.toUpperCase())) return 'Cupones e intereses'
  if (/DIVIDEND|DIV\b/.test(m.tipo.toUpperCase())) return 'Dividendos'
  if (/FUNDS|WIRE|TRANSFER|DEPOSIT|PAYMENT|JOURNAL|CHECK|DISBURSE|RECEIVED/.test(t)) return 'Transferencias'
  return 'Otros'
}

const ORDEN_CATEGORIAS = [
  'Compras', 'Ventas y vencimientos', 'Cupones e intereses', 'Dividendos', 'Transferencias', 'Comisiones y gastos', 'Impuestos', 'Money market', 'Cancelaciones', 'Otros',
]

/** Nombre legible de un cobro del Activity, sin códigos, cantidades ni fechas de registro/pago. */
function nombreCobro(desc: string) {
  const d = desc.replace(/\s+/g, ' ').trim()
  if (/CURRENCY ?CASH|U\.?S\.? ?DOLLARS.*INTEREST/i.test(d)) return 'Intereses sobre saldo en USD'
  const limpio = d
    .replace(/^\d[\d,.]*\s+SHRS?\s+/i, '')
    .replace(/\s*\(PERIOD[^)]*\)/i, '')
    .replace(/\s+(ISIN|CUSIP|ACCOUNT|RD|PD|REC|DUE|RATE|DTD|B\/E|CPN)\b.*$/i, '')
    .replace(/\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\b.*$/, '')
    .replace(/\s+\S*\d\S*[A-Z]\S*|\s+\S*[A-Z]\S*\d\S*/gi, (t) => (/\d{4,}|\d.*[A-Z].*\d/i.test(t) ? '' : t))
    .trim()
  return titulo(limpio || d)
}

// ─── Reporte ────────────────────────────────────────────────────────────────

function vacio(): Subtotal {
  return { valorMercado: 0, cuponCorrido: 0, total: 0, costo: 0, resultado: 0, peso: 0, cantidad: 0 }
}
function acumular(s: Subtotal, l: LineaPosicion) {
  s.valorMercado += l.valorMercado
  s.cuponCorrido += l.cuponCorrido
  s.total += l.total
  s.costo += l.costo ?? 0
  s.resultado += l.resultado ?? 0
  s.cantidad += 1
}

const ORDEN_CLASE = Object.fromEntries(CLASES.map((c, i) => [c, i])) as Record<Clase, number>

/** Todas las cuentas que aparecen en los archivos, por banco. */
export function cuentasDe(archivos: Archivos): { banco: Banco; cuenta: string }[] {
  const out: { banco: Banco; cuenta: string }[] = []
  for (const banco of BANCOS) {
    const set = new Set<string>()
    for (const [k, a] of Object.entries(archivos)) if (a && leerClave(k)?.banco === banco) for (const c of a.cuentas) set.add(c)
    for (const cuenta of Array.from(set).sort()) out.push({ banco, cuenta })
  }
  return out
}

/** Fecha de valuación sugerida: la más reciente de los reportes de posiciones. */
export function fechaSugerida(archivos: Archivos): string | null {
  const fechas = Object.values(archivos).filter((a) => a?.tipo === 'posiciones').map((a) => a!.fecha).filter((x): x is string => !!x)
  return fechas.sort().pop() ?? null
}

/** Clave de una posición para cargarle el cupón corrido a mano. */
export const clavePosicion = (p: Pick<Posicion, 'banco' | 'cuenta' | 'cusip' | 'descripcion'>) =>
  `${p.banco}|${p.cuenta ?? ''}|${p.cusip ?? p.descripcion}`

/**
 * `excluidas`: claves "banco|cuenta" que no entran al reporte (por si un
 * export trae más cuentas de las del cliente). Vacío = todas.
 * `manuales`: cupón corrido cargado a mano por posición (clavePosicion).
 * `externos`: tasa y vencimiento por CUSIP de OpenFIGI, para los bonos que no
 * los traen en ningún archivo (se usan solo para completar lo que falta).
 */
export function armarReporte(
  archivos: Archivos, fecha: string, excluidas: Set<string> = new Set(), manuales: Record<string, number> = {},
  externos: Record<string, Terminos> = {}, nombresCuentas: Record<string, string> = {},
): Reporte {
  const avisos: string[] = []
  const ranuras = ranurasDe(archivos)
  const etiqueta = (r: Ranura) => etiquetaRanura(r, ranuras, nombresCuentas)
  // Consolidados guardados antes de renombrar las clases: "Fondos" pasó a
  // "Fondos de inversión" y los ETF van en renta variable (Acciones).
  for (const a of Object.values(archivos)) {
    if (a?.tipo !== 'posiciones') continue
    for (const p of a.posiciones) {
      const c = p.clase as string
      if (c === 'Fondos') p.clase = 'Fondos de inversión'
      else if (c === 'ETF') p.clase = 'Acciones'
    }
  }
  const incluida = (banco: Banco, cuenta: string | null) => !cuenta || !excluidas.has(`${banco}|${cuenta}`)

  const pos = (r: Ranura) => archivos[claveArchivo(r.banco, 'posiciones', r.n)] as ArchivoPosiciones | undefined
  const cup = (r: Ranura) => archivos[claveArchivo(r.banco, 'cupones', r.n)] as ArchivoCupones | undefined
  const mov = (r: Ranura) => archivos[claveArchivo(r.banco, 'movimientos', r.n)] as ArchivoMovimientos | undefined

  const lineas: LineaPosicion[] = []
  const filasRenta: FilaRenta[] = []
  const meses = Array.from({ length: 12 }, (_, i) => sumarMeses(fecha.slice(0, 8) + '01', i).slice(0, 7))
  const mesIdx = (iso: string) => meses.indexOf(iso.slice(0, 7))

  // Tasa y vencimiento por CUSIP de todo lo que se subió, de los dos bancos:
  // si un bono está en ambos, la descripción de Pershing sirve para Morgan.
  const terminos: Record<string, Terminos> = {}
  const sumarTerminos = (cusip: string | null, t: Terminos | null) => {
    if (!cusip || !t || t.tasa == null) return
    const prev = terminos[cusip]
    if (!prev) terminos[cusip] = { ...t }
    else prev.vencimiento ??= t.vencimiento
  }
  for (const b of ranuras) {
    for (const [c, t] of Object.entries(mov(b)?.terminos ?? {})) sumarTerminos(c, t)
    for (const p of pos(b)?.posiciones ?? []) if (p.clase === 'Renta fija') sumarTerminos(p.cusip, { tasa: p.tasa, vencimiento: p.vencimiento })
    for (const x of cup(b)?.pagos ?? []) {
      if (x.cusip && x.clase === 'Cupón') {
        const info = parseDescription(x.descripcion)
        sumarTerminos(x.cusip, { tasa: info.rate, vencimiento: info.maturity })
      }
    }
  }
  for (const [c, t] of Object.entries(externos)) {
    const prev = terminos[c]
    if (!prev) terminos[c] = { ...t }
    else {
      prev.tasa ??= t.tasa
      prev.vencimiento ??= t.vencimiento
      prev.perpetuo ||= t.perpetuo
    }
  }

  for (const rn of ranuras) {
    const banco = rn.banco
    const ap = pos(rn)
    const ac = cup(rn)
    const nombreCuenta = etiqueta(rn)
    // Sin número de cuenta en el archivo (Morgan), la segunda cuenta en adelante
    // se distingue por su orden, para que no se mezclen sus posiciones.
    const todas = (ap?.posiciones ?? []).map((p) => (p.cuenta || !rn.n ? p : { ...p, cuenta: `#${rn.n + 1}` }))

    // Morgan: asignación de las filas del Projected Income a CUSIPs.
    const morgan = banco === 'Morgan Stanley' && ac ? asignarGruposMorgan(ac.pagos, todas, terminos) : null

    const sinCorrido: string[] = []
    for (const p of todas) {
      if (!incluida(banco, p.cuenta)) continue
      let valor: number | null = null
      let fuente: FuenteCorrido | null = null
      const manual = manuales[clavePosicion(p)]
      if (manual != null && isFinite(manual)) {
        valor = manual
        fuente = 'manual'
      } else if (p.cuponCorridoArchivo != null) {
        valor = p.cuponCorridoArchivo
        fuente = 'archivo'
      } else if (p.clase === 'Renta fija' && /TREASURY BILL|\bT-?BILL\b/i.test(p.descripcion)) {
        valor = 0 // letras a descuento: no devengan cupón
      } else if (p.clase === 'Renta fija') {
        if (ac && banco === 'Pershing') valor = corridoPershing(p, ac.pagos, fecha)
        if (morgan && p.cusip) valor = corridoMorgan(p, morgan.porCusip.get(p.cusip), morgan.cantidadTotal.get(p.cusip) ?? 0, fecha)
        if (valor != null) fuente = 'calendario'
        else {
          valor = corridoPorTasa(p, p.cusip ? terminos[p.cusip] : undefined, fecha)
          fuente = valor != null ? 'tasa' : 'sin datos'
          if (valor == null) sinCorrido.push(p.descripcion)
        }
      }
      const cc = r2(valor ?? 0)
      // Cupón y vencimiento: del propio archivo, si no de los otros archivos u
      // OpenFIGI, y el cupón en último caso del calendario (pago × frecuencia ÷ nominal).
      const t = p.cusip ? terminos[p.cusip] : undefined
      let tasa = p.tasa ?? t?.tasa ?? null
      if (tasa == null && p.clase === 'Renta fija' && morgan && p.cusip) {
        const g = morgan.porCusip.get(p.cusip)
        const qty = morgan.cantidadTotal.get(p.cusip) ?? 0
        if (g && qty) {
          // Los montos vienen redondeados al dólar: si queda a un pelo de un octavo, va el octavo.
          const implicita = (g.pagos[0].monto * g.frecuencia) / qty
          const octavo = Math.round(implicita * 800) / 800
          tasa = Math.abs(implicita - octavo) < 0.0001 ? octavo : Math.round(implicita * 1e5) / 1e5
        }
      }
      const linea = {
        ...p,
        tasa: p.clase === 'Renta fija' ? tasa : null,
        vencimiento: p.clase === 'Renta fija' ? p.vencimiento ?? t?.vencimiento ?? null : null,
        perpetuo: p.clase === 'Renta fija' && !(p.vencimiento ?? t?.vencimiento) && !!t?.perpetuo,
      }
      lineas.push({ ...linea, ...nombreParaCliente(linea), ranura: rn.clave, etiquetaCuenta: nombreCuenta, cuponCorrido: cc, fuenteCorrido: fuente, total: r2(p.valorMercado + cc), peso: 0 })
    }
    if (sinCorrido.length) {
      avisos.push(`${nombreCuenta}: sin datos para calcular el cupón corrido de ${sinCorrido.length} bono(s) (${sinCorrido.slice(0, 6).join('; ')}${sinCorrido.length > 6 ? '…' : ''}). ${ac ? '' : 'Subí el calendario de cupones de este banco para calcularlo.'}`.trim())
    }

    // Control del total del archivo (solo si entran todas las cuentas).
    if (ap?.totalArchivo != null && !ap.cuentas.some((c) => !incluida(banco, c))) {
      const suma = ap.posiciones.reduce((s, p) => s + p.valorMercado, 0)
      if (Math.abs(suma - ap.totalArchivo) > 1) {
        avisos.push(`${nombreCuenta}: la suma de las posiciones (${fmt(suma)}) no coincide con el total del archivo (${fmt(ap.totalArchivo)}).`)
      }
    }

    // ── Renta próximos 12 meses ──
    if (ac && banco === 'Pershing') {
      const porTitulo = new Map<string, FilaRenta>()
      for (const x of ac.pagos) {
        if (!incluida(banco, x.cuenta) || x.fecha <= fecha) continue
        const i = mesIdx(x.fecha)
        if (i < 0) continue
        const k = `${x.cuenta}|${x.cusip}|${x.clase}`
        const f = porTitulo.get(k) ?? { banco, etiquetaCuenta: nombreCuenta, cuenta: x.cuenta, cusip: x.cusip, descripcion: x.descripcion, clase: x.clase, montos: Array(12).fill(0), total: 0 }
        f.montos[i] += x.monto
        porTitulo.set(k, f)
      }
      filasRenta.push(...Array.from(porTitulo.values()))
    }
    if (ac && morgan) {
      const asignados = new Map<string, string>() // grupo → cusip
      for (const [c, g] of Array.from(morgan.porCusip.entries())) asignados.set(g.id, c)
      const grupos = new Map<string, Pago[]>()
      for (const x of ac.pagos) grupos.set(x.grupo ?? x.descripcion, [...(grupos.get(x.grupo ?? x.descripcion) ?? []), x])
      const huerfanos: string[] = []
      for (const [id, ps] of Array.from(grupos.entries())) {
        const cusip = asignados.get(id) ?? null
        let factor = 1
        let clase: ClasePago = ps[0].clase
        let descripcion = ps[0].descripcion
        if (cusip) {
          const propias = todas.filter((p) => p.cusip === cusip)
          const total = morgan.cantidadTotal.get(cusip) ?? 0
          const elegidas = propias.filter((p) => incluida(banco, p.cuenta)).reduce((s, p) => s + (p.cantidad ?? 0), 0)
          factor = total ? elegidas / total : 0
          const ref = propias[0]
          if (ref) {
            descripcion = ref.descripcion
            clase = ref.clase === 'Renta fija' ? (ps[0].clase === 'Otro' ? 'Otro' : 'Cupón') : 'Dividendo'
          }
        } else {
          // Sin posición asociada (dos bonos con el mismo nombre): queda fuera de
          // la renta antes que sumar un pago que quizá no es de esta cuenta.
          huerfanos.push(ps[0].descripcion)
          continue
        }
        if (factor <= 0) continue
        const f: FilaRenta = { banco, etiquetaCuenta: nombreCuenta, cuenta: null, cusip, descripcion, clase, montos: Array(12).fill(0), total: 0 }
        for (const x of ps) {
          if (x.fecha <= fecha) continue
          const i = mesIdx(x.fecha)
          if (i >= 0) f.montos[i] += x.monto * factor
        }
        filasRenta.push(f)
      }
      if (huerfanos.length) {
        avisos.push(`${nombreCuenta}: ${huerfanos.length} título(s) del Projected Income no se pudieron asociar a una posición y quedaron fuera de la renta (${huerfanos.slice(0, 5).join('; ')}${huerfanos.length > 5 ? '…' : ''}).`)
      }
    }
  }

  // ── Totales y pesos ──
  const totales = vacio()
  for (const l of lineas) acumular(totales, l)
  for (const l of lineas) l.peso = totales.total ? l.total / totales.total : 0
  lineas.sort((a, b) => ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] || b.total - a.total)

  const porBanco = BANCOS.filter((b) => lineas.some((l) => l.banco === b)).map((banco) => {
    const s = vacio()
    for (const l of lineas) if (l.banco === banco) acumular(s, l)
    s.peso = totales.total ? s.total / totales.total : 0
    return { banco, ...s }
  })
  const porCuenta = ranuras.filter((rn) => lineas.some((l) => l.ranura === rn.clave)).map((rn) => {
    const s = vacio()
    for (const l of lineas) if (l.ranura === rn.clave) acumular(s, l)
    s.peso = totales.total ? s.total / totales.total : 0
    return { ranura: rn.clave, banco: rn.banco, etiqueta: etiqueta(rn), ...s }
  })
  const porClase = CLASES.filter((c) => lineas.some((l) => l.clase === c)).map((clase) => {
    const s = vacio()
    for (const l of lineas) if (l.clase === clase) acumular(s, l)
    s.peso = totales.total ? s.total / totales.total : 0
    return { clase, ...s }
  })

  // ── Renta ──
  for (const f of filasRenta) {
    f.montos = f.montos.map(r2)
    f.total = r2(f.montos.reduce((s, v) => s + v, 0))
  }
  const filas = filasRenta.filter((f) => f.total !== 0).sort((a, b) => {
    const pa = a.montos.findIndex((v) => v !== 0)
    const pb = b.montos.findIndex((v) => v !== 0)
    return pa - pb || a.descripcion.localeCompare(b.descripcion)
  })
  const sumaMeses = (fs: FilaRenta[]) => meses.map((_, i) => r2(fs.reduce((s, f) => s + f.montos[i], 0)))
  const rentaPorBanco = BANCOS.filter((b) => filas.some((f) => f.banco === b)).map((banco) => {
    const montos = sumaMeses(filas.filter((f) => f.banco === banco))
    return { banco, montos, total: r2(montos.reduce((s, v) => s + v, 0)) }
  })
  const montosRenta = sumaMeses(filas)

  // ── Movimientos ──
  const movimientos = ranuras.flatMap((rn) => (mov(rn)?.movimientos ?? []).map((m) => ({ ...m, etiquetaCuenta: etiqueta(rn) })))
    .filter((m) => incluida(m.banco, m.cuenta))
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.banco.localeCompare(b.banco))
  const porCategoria = new Map<string, CategoriaMovimiento>()
  for (const m of movimientos) {
    const categoria = categoriaMovimiento(m)
    const c = porCategoria.get(categoria) ?? { categoria, cantidad: 0, monto: 0 }
    c.cantidad += 1
    c.monto = r2(c.monto + (m.monto ?? 0))
    porCategoria.set(categoria, c)
  }
  const resumenMovimientos = ORDEN_CATEGORIAS.map((c) => porCategoria.get(c)).filter((c): c is CategoriaMovimiento => !!c)
  const fechasMov = movimientos.map((m) => m.fecha).filter((x): x is string => !!x).sort()

  // ── Cobrado: cupones y dividendos del Activity, por instrumento ──
  const nombrePorCusip = new Map(lineas.filter((l) => l.cusip).map((l) => [l.cusip!, l.nombre]))
  const porInstrumento = new Map<string, Reporte['cobrados']['filas'][number]>()
  for (const m of movimientos) {
    const cat = categoriaMovimiento(m)
    if ((cat !== 'Cupones e intereses' && cat !== 'Dividendos') || !m.monto) continue
    const nombre = (m.cusip && nombrePorCusip.get(m.cusip)) || nombreCobro(m.descripcion)
    const k = `${m.etiquetaCuenta}|${m.cusip ?? nombre}`
    const f = porInstrumento.get(k) ?? {
      nombre,
      banco: m.banco, etiquetaCuenta: m.etiquetaCuenta, cupones: 0, dividendos: 0, total: 0,
    }
    if (cat === 'Dividendos') f.dividendos = r2(f.dividendos + m.monto)
    else f.cupones = r2(f.cupones + m.monto)
    f.total = r2(f.cupones + f.dividendos)
    porInstrumento.set(k, f)
  }
  const filasCobradas = Array.from(porInstrumento.values()).filter((f) => f.total !== 0).sort((a, b) => b.total - a.total)
  const cobrados = {
    filas: filasCobradas,
    cupones: r2(filasCobradas.reduce((x, f) => x + f.cupones, 0)),
    dividendos: r2(filasCobradas.reduce((x, f) => x + f.dividendos, 0)),
    total: r2(filasCobradas.reduce((x, f) => x + f.total, 0)),
  }

  // ── Rendimiento informado por el banco ──
  const rendimiento = ranuras
    .map((rn) => archivos[claveArchivo(rn.banco, 'rendimiento', rn.n)] as ArchivoRendimiento | undefined)
    .map((a, i) => (a ? { ...a, etiquetaCuenta: etiqueta(ranuras[i]) } : null))
    .filter((x): x is ArchivoRendimiento & { etiquetaCuenta: string } => !!x)

  // ── Avisos generales ──
  const numerosPorRanura = new Map<string, string[]>()
  for (const rn of ranuras) {
    const set = new Set<string>()
    for (const tipo of ['posiciones', 'movimientos', 'cupones'] as TipoArchivo[]) for (const c of archivos[claveArchivo(rn.banco, tipo, rn.n)]?.cuentas ?? []) set.add(c)
    numerosPorRanura.set(rn.clave, Array.from(set))
    if (set.size > 1) avisos.push(`${etiqueta(rn)}: los archivos son de cuentas distintas; revisá que estén en la cuenta correcta.`)
  }
  for (let i = 0; i < ranuras.length; i++) for (let j = i + 1; j < ranuras.length; j++) {
    const a = numerosPorRanura.get(ranuras[i].clave) ?? [], b = numerosPorRanura.get(ranuras[j].clave) ?? []
    if (ranuras[i].banco === ranuras[j].banco && a.some((x) => b.includes(x))) avisos.push(`${etiqueta(ranuras[i])} y ${etiqueta(ranuras[j])} parecen ser la misma cuenta: revisá que no esté sumada dos veces.`)
  }
  const fechasPos = ranuras.map((rn) => pos(rn)?.fecha ? { e: etiqueta(rn), f: pos(rn)!.fecha! } : null).filter((x): x is { e: string; f: string } => !!x)
  if (new Set(fechasPos.map((x) => x.f)).size > 1) {
    avisos.push(`Las posiciones son de fechas distintas: ${fechasPos.map((x) => `${x.e} al ${ddmmyyyy(x.f)}`).join(', ')}.`)
  }
  for (const rn of ranuras) if (pos(rn) && !cup(rn) && lineas.some((l) => l.ranura === rn.clave && l.clase === 'Renta fija')) {
    avisos.push(`${etiqueta(rn)}: no se subió el calendario de cupones; el cupón corrido de sus bonos se estimó con la tasa y el vencimiento (pago semestral).`)
  }

  return {
    fecha,
    bancos: BANCOS.filter((b) => lineas.some((l) => l.banco === b) || filas.some((f) => f.banco === b) || movimientos.some((m) => m.banco === b)),
    posiciones: lineas,
    totales: { ...totales, peso: 1 },
    porBanco,
    porCuenta,
    porClase,
    renta: {
      meses,
      filas,
      porBanco: rentaPorBanco,
      montos: montosRenta,
      total: r2(montosRenta.reduce((s, v) => s + v, 0)),
      cupones: r2(filas.filter((f) => f.clase === 'Cupón').reduce((s, f) => s + f.total, 0)),
      dividendos: r2(filas.filter((f) => f.clase === 'Dividendo').reduce((s, f) => s + f.total, 0)),
    },
    movimientos,
    resumenMovimientos,
    periodoMovimientos: { desde: fechasMov[0] ?? null, hasta: fechasMov[fechasMov.length - 1] ?? null },
    rendimiento,
    cobrados,
    avisos,
  }
}

// ─── Nombres para el cliente ────────────────────────────────────────────────

const SIGLAS = /^(SA|SAU|BV|NV|LLC|PLC|USD|EUR|ETF|ETN|YPF|HSBC|BBVA|JPM|MSCI|QQQ|DNCA|IBM|HP|GM|UK|US|NA|AG|DAC|II|III|IV|GIS|ACC|DIST|HDG|BDP)$/
const MINUSCULAS = /^(of|de|del|y|and|the)$/

function titulo(s: string) {
  return s
    .toLowerCase()
    .replace(/[a-z0-9.&']+/g, (w, off: number, todo: string) => {
      const base = w.replace(/\./g, '').toUpperCase()
      if (SIGLAS.test(base) || todo[off - 1] === '(') return w.toUpperCase()
      if (off > 0 && MINUSCULAS.test(w)) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .replace(/\bJpmorgan\b/g, 'JPMorgan')
}

const CORTES_EMISOR = [
  /\s+ISIN#?/, /\s+FXD\b/, /\s+VAR\b/, /\s+FIXED\b/, /\s+REG\s?S\b/, /\s+B\/E\b/, /\s+SR\s+NTS?\b/, /\s+MEDIUM TERM\b/,
  /\s+\d{1,2}(\.\d+)?%/, /\s+\d{2}\/\d{2}\/\d{2}\b/, /\s+(BOND|NOTES?)\b/, /\s+COCO\b/,
]

/** "YPF SA BOND ISIN#USP989MJBY67 8.250% 01/17/34…" → "YPF SA 8.25% 2034", con detalle "CUSIP … · Cupón 8.250% · Vto. 17/01/2034". */
function nombreParaCliente(p: Pick<Posicion, 'descripcion' | 'clase' | 'cusip' | 'simbolo' | 'tasa' | 'vencimiento'> & { perpetuo: boolean }) {
  const desc = p.descripcion.replace(/\s+/g, ' ').trim()
  const id = [p.cusip ? `CUSIP ${p.cusip}` : null, p.simbolo].filter(Boolean).join(' · ')
  if (p.clase !== 'Renta fija') {
    const limpio = desc.replace(/\s*ISIN[#\s]*[A-Z]{2}[A-Z0-9]{9}\d\s*/i, ' ').replace(/\s+COM$/i, '').replace(/\s+/g, ' ').trim()
    return { nombre: titulo(limpio), detalle: id }
  }
  let corte = desc.length
  for (const re of CORTES_EMISOR) {
    const m = re.exec(desc)
    if (m && m.index > 0 && m.index < corte) corte = m.index
  }
  const emisor = titulo(desc.slice(0, corte).trim() || desc)
  const tasa = p.tasa != null ? `${Number((p.tasa * 100).toFixed(3))}%` : null
  const anio = p.vencimiento ? p.vencimiento.slice(0, 4) : p.perpetuo ? 'Perp.' : null
  const nombre = [emisor, tasa, anio].filter(Boolean).join(' ')
  const detalle = [
    id,
    p.tasa != null ? `Cupón ${(p.tasa * 100).toFixed(3)}%` : 'Cupón s/d',
    p.vencimiento ? `Vto. ${ddmmyyyy(p.vencimiento)}` : p.perpetuo ? 'Perpetuo' : 'Vto. s/d',
  ].filter(Boolean).join(' · ')
  return { nombre, detalle }
}

/** "Compra 31/07/2026" o "Compras 24/11/2025, 27/02/2026 y 31/07/2026". */
export function textoCompras(fechas: string[] | undefined) {
  const fs = (fechas ?? []).map(ddmmyyyy)
  if (!fs.length) return ''
  if (fs.length === 1) return `Compra ${fs[0]}`
  return `Compras ${fs.slice(0, -1).join(', ')} y ${fs[fs.length - 1]}`
}

/** CUSIPs de bonos a los que les falta cupón o vencimiento en todos los archivos (para buscarlos en OpenFIGI). */
export function bonosIncompletos(archivos: Archivos): string[] {
  const r = armarReporte(archivos, '2000-01-01')
  return Array.from(new Set(
    r.posiciones.filter((l) => l.clase === 'Renta fija' && l.cusip && (l.tasa == null || (!l.vencimiento && !l.perpetuo))).map((l) => l.cusip!),
  )).sort()
}

// ─── Formatos ───────────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined, decimales = 2) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  return n < 0 ? `(${s})` : s
}

export const fmtPct = (n: number | null | undefined, decimales = 1) => (n == null ? '—' : `${(n * 100).toFixed(decimales)}%`)

export const ddmmyyyy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const mesCorto = (ym: string) => `${MESES_CORTOS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

export const ETIQUETA_FUENTE: Record<FuenteCorrido, string> = {
  archivo: 'informado por el banco',
  manual: 'cargado a mano',
  calendario: 'calculado con el calendario de cupones',
  tasa: 'estimado con tasa y vencimiento',
  'sin datos': 'sin datos para calcularlo',
}
