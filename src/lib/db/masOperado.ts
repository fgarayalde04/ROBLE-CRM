import { pool } from './pool'

// "Lo más operado": ranking de instrumentos comprados y vendidos en un período,
// a partir de las órdenes que se envían desde la plataforma (Solicitudes, con
// todos los activos de cada orden, y las del Blotter anterior). Cuenta
// operaciones y clientes distintos; los montos y nominales no se suman (vienen
// en monedas y unidades distintas). No cuentan las canceladas, devueltas ni
// las que el cliente rechazó.

export type ClaseActivo = 'fondos' | 'bonos' | 'acciones'
export type Lado = 'compra' | 'venta'

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

function rankear(ops: Operacion[]): InstrumentoOperado[] {
  const grupos = new Map<string, Operacion[]>()
  for (const op of ops) {
    const k = claveDe(op)
    const g = grupos.get(k)
    if (g) g.push(op); else grupos.set(k, [op])
  }
  const lista: InstrumentoOperado[] = []
  grupos.forEach((g, key) => {
    lista.push({
      key,
      nombre: masFrecuente(g.map((o) => o.nombre)),
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
    })
  })
  return lista.sort((a, b) => b.operaciones - a.operaciones || b.clientes - a.clientes || a.nombre.localeCompare(b.nombre))
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
  const fondos = [...ranking.fondos.compras, ...ranking.fondos.ventas].filter((f) => f.isin)
  if (fondos.length) {
    try {
      const { rows } = await pool.query(
        `select upper(f.isin) as isin, r.r_ytd, r.r_1y
           from fund_monitor_funds f left join fund_monitor_returns r on r.fund_id = f.id
          where upper(f.isin) = any($1)`,
        [Array.from(new Set(fondos.map((f) => f.isin)))]
      )
      const porIsin = new Map(rows.map((r) => [r.isin as string, r]))
      for (const f of fondos) {
        const m = porIsin.get(f.isin)
        if (m) { f.r_ytd = m.r_ytd == null ? null : Number(m.r_ytd); f.r_1y = m.r_1y == null ? null : Number(m.r_1y) }
      }
    } catch (e: any) {
      console.error('[mas-operado] monitor', e.message)
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

export async function getRankingMasOperado(desde: string, hasta: string, limite = 25): Promise<RankingMasOperado> {
  const [nuevas, anteriores] = await Promise.all([
    operacionesSolicitudes(desde, hasta),
    operacionesBlotterAnterior(desde, hasta).catch((e) => {
      console.error('[mas-operado] blotter anterior', e.message)
      return [] as Operacion[]
    }),
  ])
  const ranking = armarRanking([...nuevas, ...anteriores], limite)
  await completar(ranking)
  return ranking
}

export function armarRanking(ops: Operacion[], limite: number): RankingMasOperado {
  const ranking = {} as RankingMasOperado
  for (const clase of ['fondos', 'bonos', 'acciones'] as ClaseActivo[]) {
    const deClase = ops.filter((o) => o.clase === clase)
    const compras = deClase.filter((o) => o.lado === 'compra')
    const ventas = deClase.filter((o) => o.lado === 'venta')
    ranking[clase] = {
      compras: rankear(compras).slice(0, limite),
      ventas: rankear(ventas).slice(0, limite),
      totales: { compras: compras.length, ventas: ventas.length },
    }
  }
  return ranking
}
