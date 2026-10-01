import { pool } from './pool'

// "Lo más operado": ranking de instrumentos comprados y vendidos en un período,
// a partir de las órdenes que se envían desde la plataforma (Solicitudes, con
// todos los activos de cada orden, y las del Blotter anterior). Cuenta
// operaciones y clientes distintos; los montos y nominales no se suman (vienen
// en monedas y unidades distintas). No cuentan las canceladas, devueltas ni
// las que el cliente rechazó.

export type ClaseActivo = 'fondos' | 'bonos' | 'acciones'
export type Lado = 'compra' | 'venta'

export interface Rendimientos {
  fuente: string          // nombre del fondo en el Monitor
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
}

export interface InstrumentoOperado {
  key: string
  nombre: string
  isin: string
  ticker: string
  clase: string        // clase del fondo (Acumulativa / Distributiva)
  moneda: string
  cupon: string
  vencimiento: string
  operaciones: number
  clientes: number
  // Datos del Monitor de fondos (por ISIN), si el fondo está ahí
  r_ytd: number | null
  r_1y: number | null
  rendimientos: Rendimientos | null
  // Fondos: cada clase operada que se unió en esta fila (con una sola clase, esa)
  variantes?: { nombre: string; isin: string; clase: string; moneda: string; operaciones: number }[]
}

export interface RankingClase {
  compras: InstrumentoOperado[]
  ventas: InstrumentoOperado[]
  totales: { compras: number; ventas: number }
}

export type RankingMasOperado = Record<ClaseActivo, RankingClase>

export interface Operacion {
  clase: ClaseActivo
  lado: Lado
  nombre: string
  isin: string
  ticker: string
  claseFondo: string
  moneda: string
  cupon: string
  vencimiento: string
  cliente: string
}

const ESTADOS_EXCLUIDOS = ['cancelada', 'devuelta', 'rechazada_cliente']

const txt = (v: unknown) => (v == null ? '' : String(v).trim())

function claseDe(v: unknown): ClaseActivo | null {
  const s = txt(v).toLowerCase()
  if (s.startsWith('fond')) return 'fondos'
  if (s.startsWith('bon')) return 'bonos'
  if (s.startsWith('acc')) return 'acciones'
  return null
}

function ladoDe(v: unknown): Lado | null {
  const s = txt(v).toLowerCase()
  if (s === 'compra' || s === 'suscripcion') return 'compra'
  if (s === 'venta' || s === 'rescate') return 'venta'
  return null
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%.,]+/g, ' ').trim()
}

function claveDe(op: Operacion) {
  const isin = op.isin.toUpperCase().replace(/\s+/g, '')
  if (isin.length >= 9) return `id:${isin}`
  if (op.clase === 'acciones' && op.ticker) return `tk:${op.ticker.toUpperCase()}`
  return `nm:${normalizar(op.nombre)}`
}

function desdeBloque(b: any, lado: Lado | null, cliente: string): Operacion | null {
  const clase = claseDe(b?.type)
  const l = ladoDe(b?.operacion) ?? lado
  if (!clase || !l) return null
  return {
    clase, lado: l, cliente,
    nombre: txt(clase === 'fondos' ? b.fondo : clase === 'bonos' ? b.descripcion : b.nombre),
    isin: txt(b.cusipIsin),
    ticker: txt(b.ticker),
    claseFondo: clase === 'fondos' ? txt(b.clase) : '',
    moneda: txt(b.moneda),
    cupon: clase === 'bonos' ? txt(b.cupon) : '',
    vencimiento: clase === 'bonos' ? txt(b.maturity) : '',
  }
}

/** Operaciones de una solicitud: una por activo de la orden (assets_json) o la del encabezado. */
export function operacionesDeSolicitud(r: any): Operacion[] {
  const cliente = txt(r.client_number) || txt(r.client_name)
  let bloques: any = r.assets_json
  if (typeof bloques === 'string') { try { bloques = JSON.parse(bloques) } catch { bloques = null } }
  if (Array.isArray(bloques) && bloques.length > 0) {
    return bloques
      .map((b) => desdeBloque(b, ladoDe(r.tipo_operacion), cliente))
      .filter((op): op is Operacion => !!op && !!op.nombre)
  }
  const clase = claseDe(r.instrumento_tipo)
  const lado = ladoDe(r.tipo_operacion)
  if (!clase || !lado || !txt(r.instrumento_nombre)) return []
  return [{
    clase, lado, cliente,
    nombre: txt(r.instrumento_nombre), isin: txt(r.cusip_isin), ticker: txt(r.symbol),
    claseFondo: clase === 'fondos' ? txt(r.clase) : '', moneda: txt(r.moneda),
    cupon: clase === 'bonos' ? txt(r.cupon) : '', vencimiento: clase === 'bonos' ? txt(r.maturity) : '',
  }]
}

async function operacionesSolicitudes(desde: string, hasta: string): Promise<Operacion[]> {
  const { rows } = await pool.query(
    `select tipo_operacion, instrumento_tipo, instrumento_nombre, cusip_isin, symbol, clase, moneda,
            maturity, cupon, assets_json, client_number, client_name
       from solicitudes
      where created_at >= $1 and created_at <= $2 and coalesce(estado, '') <> all($3)`,
    [`${desde}T00:00:00.000-03:00`, `${hasta}T23:59:59.999-03:00`, ESTADOS_EXCLUIDOS]
  )
  return rows.flatMap(operacionesDeSolicitud)
}

async function operacionesBlotterAnterior(desde: string, hasta: string): Promise<Operacion[]> {
  const { rows } = await pool.query(
    `select i.order_type, i.operation_type, i.instrument_name, i.symbol, i.cusip, i.moneda, i.cupon, i.maturity,
            o.client_number, o.client_name
       from order_history_items i
       join order_history o on o.id = i.order_id
      where o.created_at >= $1 and o.created_at <= $2 and coalesce(i.estado, '') <> 'cancelada'`,
    [`${desde}T00:00:00.000-03:00`, `${hasta}T23:59:59.999-03:00`]
  )
  const ops: Operacion[] = []
  for (const r of rows) {
    const clase = claseDe(r.order_type)
    const lado = ladoDe(r.operation_type)
    if (!clase || !lado || !txt(r.instrument_name)) continue
    ops.push({
      clase, lado, cliente: txt(r.client_number) || txt(r.client_name),
      nombre: txt(r.instrument_name), isin: txt(r.cusip), ticker: txt(r.symbol), claseFondo: '',
      moneda: txt(r.moneda), cupon: clase === 'bonos' ? txt(r.cupon) : '', vencimiento: clase === 'bonos' ? txt(r.maturity) : '',
    })
  }
  return ops
}

// El valor más repetido (para nombre, clase, moneda… cuando varían entre órdenes)
function masFrecuente(valores: string[]) {
  const n = new Map<string, number>()
  for (const v of valores) if (v) n.set(v, (n.get(v) ?? 0) + 1)
  let mejor = ''
  let max = 0
  n.forEach((c, v) => { if (c > max) { mejor = v; max = c } })
  return mejor
}

// Unir las clases de un mismo fondo: la tesis es la misma, solo cambia la clase.
// Los nombres vienen como "AB FCP I AMERICAN INCOME FUND CLASS A2 (USD)(CAP)",
// "SOLITAIRE GLOBAL BOND FUND CLASS UO (USD) ISIN LI1228564368",
// "THORNBURG … FD CL A USD" o "PIMCO GIS Income Fund E Acc USD":
//   1. se corta desde "CLASS" / "CLASE" / "CL" (lo que sigue es la clase),
//   2. se sacan paréntesis, "ISIN …" y, al final, letras o códigos de clase,
//      Acc/Dist, moneda y cobertura.
// Para comparar (familiaFondo) además se ignoran palabras del paraguas o
// estructura (FCP, SICAV, PLC, GIS…) y FD = FUND.
const TOKENS_CLASE = new Set([
  'acc', 'accumulating', 'accumulation', 'acumulativa', 'acum', 'dis', 'dist', 'distr', 'distributing', 'distribution',
  'distributiva', 'cap', 'inc', 'hedged', 'hdg', 'h', 'unhedged', 'usd', 'eur', 'gbp', 'chf', 'jpy',
  'inst', 'institutional', 'retail', 'adm', 'admin', 'share', 'shares',
])
const PALABRAS_PARAGUAS = new Set([
  // estructura / paraguas
  'fcp', 'sicav', 'sicv', 'plc', 'sa', 'ucits', 'gsf', 'isf', 'gis', 'gf', 'ftgf', 'icav', 'lux', 'as', 'fund', 'funds', 'fd',
  'tranche', 'institutional', 'service',
  // segunda palabra de la gestora que a veces se omite
  'berman', 'meridian', 'henderson', 'horizon', 'glg', 'standard', 'twentyfour', 'invst', 'invest',
  // relleno
  'the', 'de', 'of', 'and', 'port', 'portfolio', 'equities',
])
// Variantes de escritura de una misma palabra
const SINONIMOS: Record<string, string> = {
  invt: 'investment', intl: 'international', corp: 'corporate', mkts: 'markets', em: 'emerging', emerg: 'emerging',
  opp: 'opportunities', opps: 'opportunities', bonds: 'bond', financials: 'financial', schroders: 'schroder',
  prinebridge: 'pinebridge', creditcorp: 'credicorp', thorburg: 'thornburg', latam: 'latin america', america: 'american',
  usd: 'us dollar',
}
// Mismo fondo escrito de formas que ninguna regla general resuelve sin riesgo
// (claves ya normalizadas: palabras sin repetir, en orden alfabético)
const ALIAS_FAMILIA: Record<string, string> = {
  'equity global infrastructure lazard': 'equity global infrastructure lazard listed',
  'global infrastructure lazard listed': 'equity global infrastructure lazard listed',
  'enhanced muzinich short term': 'enhanced muzinich short term yield',
  'aegon global high yield': 'aegon bond global high yield',
  'american capital corporate credicorp debt latin': 'american corporate credicorp debt latin',
  // Morgan Stanley Investment Funds = paraguas ("investment grade" no se toca)
  'brands global investment morgan stanley': 'brands global morgan stanley',
  'high man opportunities yield': 'global high man opportunities yield',
  'global high janus yield': 'bond global high janus yield',
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function esTokenClase(t: string) {
  const n = sinAcentos(t).replace(/[^a-z0-9]/g, '')
  if (!n) return true
  return TOKENS_CLASE.has(n) || /^[a-z]{1,2}\d?h?$/.test(n) && n.length <= 2 || /^[a-z]\d[a-z]?$/.test(n)
}

/** Nombre del fondo sin lo que identifica la clase (conserva mayúsculas para mostrarlo). */
export function nombreSinClase(nombre: string) {
  let n = nombre
    .replace(/\bISIN\s*[:#]?\s*[A-Z0-9]{9,12}\b/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
  // "CLASS A2", "SHARE CLASS I", "CLASE B", "CL A": todo lo que sigue es la clase
  n = n.replace(/\s(?:share\s+)?(?:class|clase|cl)\b[\s\S]*$/i, ' ')
  const tokens = n.split(/[\s/]+/).filter((t) => t && t !== '-' && t !== '–')
  // Al final suelen quedar letra de clase, Acc/Dist, moneda: se sacan de atrás para adelante
  while (tokens.length > 2 && esTokenClase(tokens[tokens.length - 1])) tokens.pop()
  const limpio = tokens.join(' ').replace(/[\s\-–,]+$/, '').trim()
  return limpio.length >= 3 ? limpio : nombre.trim()
}

/** Nombre del fondo como se muestra: sin la clase, en mayúsculas, sin "-" ni el "FUND" del final. */
export function nombreFondoMostrado(nombre: string) {
  return nombreSinClase(nombre).toUpperCase()
    .replace(/\s+[-–]\s+/g, ' ')
    .replace(/\s+(?:FUND|FD)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clave para reconocer el mismo fondo aunque cambie la clase o se escriba con/sin el paraguas. */
export function familiaFondo(nombre: string) {
  const texto = sinAcentos(nombreSinClase(nombre))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bu s\b/g, 'us')
    .replace(/\btwenty four\b/g, 'twentyfour')
    .replace(/\bglobal (?:invt|investment) plc\b/g, ' ')
    .replace(/\bmandato(?: (?:ppal|principal|global))?\b/g, ' ')   // nombres internos de mandatos
  const tokens = texto.split(' ')
    .map((t) => SINONIMOS[t] ?? t)
    .flatMap((t) => t.split(' '))
    .map((t) => SINONIMOS[t] ?? t)
    .filter((t) => t && !PALABRAS_PARAGUAS.has(t) && !/^(i|ii|iii|iv)$/.test(t))
  // Sin orden: "Aegon Global High Yield" = "Aegon High Yield Global"
  const clave = Array.from(new Set(tokens)).sort().join(' ')
  return ALIAS_FAMILIA[clave] ?? clave
}

function agrupar(ops: Operacion[], clave: (o: Operacion) => string) {
  const grupos = new Map<string, Operacion[]>()
  for (const op of ops) {
    const k = clave(op)
    const g = grupos.get(k)
    if (g) g.push(op); else grupos.set(k, [op])
  }
  return grupos
}

function resumen(key: string, g: Operacion[], nombre?: string): InstrumentoOperado {
  return {
    key,
    nombre: nombre ?? masFrecuente(g.map((o) => o.nombre)),
    isin: masFrecuente(g.map((o) => o.isin.toUpperCase())),
    ticker: masFrecuente(g.map((o) => o.ticker.toUpperCase())),
    clase: masFrecuente(g.map((o) => o.claseFondo)),
    moneda: masFrecuente(g.map((o) => o.moneda.toUpperCase())),
    cupon: masFrecuente(g.map((o) => o.cupon)),
    vencimiento: masFrecuente(g.map((o) => o.vencimiento)),
    operaciones: g.length,
    clientes: new Set(g.map((o) => o.cliente).filter(Boolean)).size,
    r_ytd: null,
    r_1y: null,
    rendimientos: null,
  }
}

const porOperaciones = (a: InstrumentoOperado, b: InstrumentoOperado) =>
  b.operaciones - a.operaciones || b.clientes - a.clientes || a.nombre.localeCompare(b.nombre)

// Cada fila trae en `variantes` el detalle de lo que agrupa (nombre tal cual
// se cargó, ISIN, moneda, órdenes), que se ve al desplegarla.
// unirClases (fondos): las distintas clases o formas de escribir un mismo fondo
// cuentan como uno, con el nombre limpio.
function rankear(ops: Operacion[], unirClases: boolean): InstrumentoOperado[] {
  const porInstrumento = Array.from(agrupar(ops, claveDe), ([key, g]) => ({ key, g, item: resumen(key, g) }))
  const familias = new Map<string, typeof porInstrumento>()
  for (const x of porInstrumento) {
    const k = unirClases ? `fam:${familiaFondo(x.item.nombre) || normalizar(x.item.nombre)}` : x.key
    const f = familias.get(k)
    if (f) f.push(x); else familias.set(k, [x])
  }
  const lista: InstrumentoOperado[] = []
  familias.forEach((f, key) => {
    const variantes = f.map((x) => x.item).sort(porOperaciones)
    const nombre = unirClases ? nombreFondoMostrado(variantes[0].nombre) : variantes[0].nombre.toUpperCase().replace(/\s+/g, ' ').trim()
    const item = resumen(f.length === 1 ? f[0].key : key, f.flatMap((x) => x.g), nombre)
    item.isin = variantes[0].isin   // el más operado (para buscar rendimientos)
    item.variantes = variantes.map((v) => ({ nombre: v.nombre, isin: v.isin, clase: v.clase, moneda: v.moneda, operaciones: v.operaciones }))
    lista.push(item)
  })
  return lista.sort(porOperaciones)
}

const fmtFecha = (v: unknown) => {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

const fmtCupon = (v: unknown) => {
  const n = Number(v)
  return v == null || v === '' || Number.isNaN(n) ? '' : `${String(n).replace('.', ',')}%`
}

// Completa con datos de otras fuentes: rendimientos del Monitor (fondos) y
// cupón/vencimiento del maestro de instrumentos (bonos) cuando la orden no los trae.
async function completar(ranking: RankingMasOperado) {
  const fondos = [...ranking.fondos.compras, ...ranking.fondos.ventas]
  if (fondos.length) {
    try {
      const { rows } = await pool.query(
        `select upper(f.isin) as isin, f.nombre, r.r_1y, r.r_3y, r.r_5y, r.r_ytd, r.y_2025, r.y_2024, r.y_2023
           from fund_monitor_funds f join fund_monitor_returns r on r.fund_id = f.id
          where f.active and r.status in ('ok', 'stale')`
      )
      const num = (v: unknown) => (v == null ? null : Number(v))
      const aRend = (m: any): Rendimientos => ({
        fuente: `${m.nombre} (Monitor de fondos)`, r_1y: num(m.r_1y), r_3y: num(m.r_3y), r_5y: num(m.r_5y), r_ytd: num(m.r_ytd),
        y_2025: num(m.y_2025), y_2024: num(m.y_2024), y_2023: num(m.y_2023),
      })
      const porIsin = new Map(rows.map((r) => [r.isin as string, r]))
      const porFamilia = new Map<string, any>()
      for (const r of rows) {
        const k = familiaFondo(r.nombre)
        if (k && !porFamilia.has(k)) porFamilia.set(k, r)
      }
      for (const f of fondos) {
        // Primero el ISIN de la clase más operada, después el de cualquier otra
        // clase del mismo fondo y, si no, el mismo fondo por nombre
        const isins = [f.isin, ...(f.variantes ?? []).map((v) => v.isin)].filter(Boolean)
        const m = isins.map((i) => porIsin.get(i)).find(Boolean)
          ?? [f.nombre, ...(f.variantes ?? []).map((v) => v.nombre)].map((n) => porFamilia.get(familiaFondo(n))).find(Boolean)
        if (!m) continue
        f.rendimientos = aRend(m)
        f.r_ytd = f.rendimientos.r_ytd
        f.r_1y = f.rendimientos.r_1y
      }
    } catch (e: any) {
      console.error('[mas-operado] monitor', e.message)
    }

    // Los que no están en el Monitor: búsquedas por ISIN que ya se hicieron en
    // Davinci (propuestas) y quedaron guardadas. Solo se lee lo guardado; nunca
    // se dispara una búsqueda nueva (Davinci bloquea la cuenta por logins).
    const faltan = fondos.filter((f) => !f.rendimientos)
    const isins = Array.from(new Set(faltan.flatMap((f) => [f.isin, ...(f.variantes ?? []).map((v) => v.isin)]).filter(Boolean)))
    if (isins.length) {
      try {
        const { rows } = await pool.query(
          `select upper(isin) as isin, data from davinci_lookup_cache where upper(isin) = any($1) and data is not null`,
          [isins]
        )
        const porIsin = new Map(rows.map((r) => [r.isin as string, typeof r.data === 'string' ? JSON.parse(r.data) : r.data]))
        for (const f of faltan) {
          const d = [f.isin, ...(f.variantes ?? []).map((v) => v.isin)].map((i) => porIsin.get(i)).find(Boolean)
          if (!d) continue
          const n = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
          f.rendimientos = {
            fuente: d.nombreDavinci ? `${d.nombreDavinci} (búsqueda en Davinci)` : 'búsqueda en Davinci',
            r_1y: n(d.r1a), r_3y: n(d.r3a), r_5y: n(d.r5a), r_ytd: n(d.ytd), y_2025: n(d.y2025), y_2024: n(d.y2024), y_2023: n(d.y2023),
          }
          f.r_ytd = f.rendimientos.r_ytd
          f.r_1y = f.rendimientos.r_1y
        }
      } catch (e: any) {
        if (e.code !== '42P01') console.error('[mas-operado] davinci cache', e.message)
      }
    }
  }

  const bonos = [...ranking.bonos.compras, ...ranking.bonos.ventas].filter((b) => b.isin && (!b.cupon || !b.vencimiento))
  if (bonos.length) {
    try {
      const ids = Array.from(new Set(bonos.map((b) => b.isin)))
      const { rows } = await pool.query(
        `select upper(isin) as isin, upper(cusip) as cusip, coupon, maturity_date
           from instrument_master where upper(isin) = any($1) or upper(cusip) = any($1)`,
        [ids]
      )
      for (const b of bonos) {
        const m = rows.find((r) => r.isin === b.isin || r.cusip === b.isin)
        if (!m) continue
        if (!b.cupon) b.cupon = fmtCupon(m.coupon)
        if (!b.vencimiento) b.vencimiento = fmtFecha(m.maturity_date)
      }
    } catch (e: any) {
      if (e.code !== '42703') console.error('[mas-operado] maestro', e.message)
    }
  }
}

export async function getRankingMasOperado(desde: string, hasta: string, limite = 25, unirClases = true): Promise<RankingMasOperado> {
  const [nuevas, anteriores] = await Promise.all([
    operacionesSolicitudes(desde, hasta),
    operacionesBlotterAnterior(desde, hasta).catch((e) => {
      console.error('[mas-operado] blotter anterior', e.message)
      return [] as Operacion[]
    }),
  ])
  const ranking = armarRanking([...nuevas, ...anteriores], limite, unirClases)
  await completar(ranking)
  return ranking
}

export function armarRanking(ops: Operacion[], limite: number, unirClases = true): RankingMasOperado {
  const ranking = {} as RankingMasOperado
  for (const clase of ['fondos', 'bonos', 'acciones'] as ClaseActivo[]) {
    const deClase = ops.filter((o) => o.clase === clase)
    const compras = deClase.filter((o) => o.lado === 'compra')
    const ventas = deClase.filter((o) => o.lado === 'venta')
    ranking[clase] = {
      compras: rankear(compras, unirClases && clase === 'fondos').slice(0, limite),
      ventas: rankear(ventas, unirClases && clase === 'fondos').slice(0, limite),
      totales: { compras: compras.length, ventas: ventas.length },
    }
  }
  return ranking
}
