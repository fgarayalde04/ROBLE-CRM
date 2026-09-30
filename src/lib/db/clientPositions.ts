import { pool } from './pool'
import { createInstrument, reclassifyInstrumentsSafe } from './instruments'
import {
  PERFIL_CLIENTE, calcularRiesgoCartera, compararConPerfil, isPerfilCliente,
  type RiskGroup, type PerfilCliente, type RiesgoCartera, type EstadoPerfil,
} from '../riskGroups'

// Posiciones vigentes por cliente para el riesgo de su cartera:
//   1. Carga inicial: export de posiciones de las cuentas (reemplaza las
//      cuentas que trae el archivo).
//   2. Después, cada orden ejecutada las ajusta sola (applySolicitudEjecutada).
// El riesgo del cliente se calcula al vuelo: promedio del puntaje de sus
// instrumentos (instrument_master) ponderado por monto.

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Número desde Excel/formularios: "1,234.56", "1.234,56", "10000.5", "$ 1,000", "-" */
export function parseNumero(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).replace(/[$\s]/g, '').replace(/^USD/i, '')
  if (!s || s === '-' || s === '—') return null
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Fecha de Excel a ISO: "10/10/2028" (mm/dd/aaaa de los exports de EE.UU.), "2028-10-10" o serial */
export function fechaIso(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const CUSIP_RE = /^[A-Z0-9]{9}$/

type Tipo = 'accion' | 'fondo' | 'bono' | 'cash'

/** Tipo de activo a partir del "Product Type"/"Asset Type" del export */
export function tipoDesdeProducto(producto: string | null | undefined, nombre = ''): Tipo | null {
  const t = `${producto ?? ''}`.toLowerCase()
  const n = nombre.toLowerCase()
  if (/cash|money market|mmf|bdp|deposit|sweep/.test(t) || /bank deposit program|money market/.test(n)) return 'cash'
  if (/fixed income|bond|bono|treasur|note|cd\b|certificate/.test(t)) return 'bono'
  // ETF antes que "fund": el clasificador de acciones ya lee los ETF por nombre
  if (/\betf|\betp|exchange traded/.test(t)) return 'accion'
  if (/mutual fund|fund|fondo|\buit\b|alternative/.test(t)) return 'fondo'
  if (/equit|stock|common|share|acci|adr|preferred/.test(t)) return 'accion'
  return null
}

interface InstrumentRef { tipo: Tipo; nombre: string; isin?: string | null; cusip?: string | null; symbol?: string | null }

const cacheKey = (r: InstrumentRef) => `${r.tipo}|${r.isin ?? ''}|${r.cusip ?? ''}|${r.symbol ?? ''}|${r.nombre}`

/**
 * Busca el instrumento en el maestro (ISIN, CUSIP o ticker) y, si no está, lo
 * crea y lo clasifica. Devuelve la clave de la posición. El cash no necesita
 * instrumento: cuenta siempre como Liquidez.
 */
async function resolverInstrumento(ref: InstrumentRef, cache: Map<string, { id: string | null; key: string }>) {
  const ck = cacheKey(ref)
  const hit = cache.get(ck)
  if (hit) return hit

  let isin = ref.isin?.trim().toUpperCase() || null
  let cusip = ref.cusip?.trim().toUpperCase() || null
  const symbol = ref.symbol?.trim().toUpperCase() || null
  // Hay exports y formularios que ponen el ISIN en la columna CUSIP (o al revés)
  if (cusip && ISIN_RE.test(cusip) && !isin) { isin = cusip; cusip = null }
  if (isin && !ISIN_RE.test(isin) && CUSIP_RE.test(isin) && !cusip) { cusip = isin; isin = null }

  if (ref.tipo === 'cash') {
    const out = { id: null, key: `CASH:${cusip ?? symbol ?? ref.nombre.toUpperCase()}` }
    cache.set(ck, out)
    return out
  }

  const buscar = async () => {
    if (isin) {
      const { rows } = await pool.query(`select id from instrument_master where upper(isin) = $1 limit 1`, [isin])
      if (rows[0]) return rows[0].id as string
    }
    if (cusip) {
      const { rows } = await pool.query(`select id from instrument_master where upper(cusip) = $1 limit 1`, [cusip])
      if (rows[0]) return rows[0].id as string
    }
    if (symbol && symbol !== '-') {
      const { rows } = await pool.query(
        `select id from instrument_master where upper(ticker) = $1 order by (tipo_activo = $2) desc limit 1`,
        [symbol, ref.tipo]
      )
      if (rows[0]) return rows[0].id as string
    }
    return null
  }

  let id = await buscar()
  if (!id && (isin || cusip || (symbol && symbol !== '-'))) {
    try {
      const row = await createInstrument({
        tipo_activo: ref.tipo,
        nombre: ref.nombre.trim() || isin || cusip || symbol,
        isin, cusip,
        ticker: symbol && symbol !== '-' ? symbol : null,
        moneda: 'USD',
        activo: true,
      })
      id = row.id
      await reclassifyInstrumentsSafe([row.id])
    } catch (e: any) {
      if (e.code !== '23505') throw e
      id = await buscar()                   // otro proceso lo creó justo antes
    }
  }
  const out = { id, key: id ?? `NOMBRE:${(isin ?? cusip ?? symbol ?? ref.nombre).toUpperCase()}` }
  cache.set(ck, out)
  return out
}

// ── Carga inicial ────────────────────────────────────────────────────────────

export interface FilaPosicion {
  account: string
  nombre: string
  producto?: string | null
  symbol?: string | null
  cusip?: string | null
  isin?: string | null
  cantidad?: number | string | null
  monto?: number | string | null
  /** Bonos: rating y vencimiento si el export los trae (se guardan en el maestro) */
  rating?: string | null
  vencimiento?: string | null
}

export interface ResultadoCarga {
  loadId: string
  filas: number
  posiciones: number
  cuentas: number
  cuentasSinCliente: string[]
  clientes: number
  sinTipo: number
}

export async function cargarPosiciones(
  filas: FilaPosicion[],
  meta: { fileName?: string | null; fechaDatos?: string | null; user: string }
): Promise<ResultadoCarga> {
  const validas = filas.filter(f => f.account?.toString().trim() && f.nombre?.toString().trim())
  const cuentas = Array.from(new Set(validas.map(f => f.account.toString().trim().toUpperCase())))

  // Cuenta → cliente (monitoring_base_accounts, igual que el import de portfolio)
  const { rows: mapRows } = await pool.query(
    `select upper(account_number) as account, client_code from monitoring_base_accounts
      where upper(account_number) = any($1::text[])`,
    [cuentas]
  )
  const clientePorCuenta = new Map<string, string | null>(mapRows.map(r => [r.account, r.client_code ?? null]))
  const cuentasSinCliente = cuentas.filter(c => !clientePorCuenta.get(c))

  // Instrumentos (fuera de la transacción: puede crear los que falten)
  const cache = new Map<string, { id: string | null; key: string }>()
  type Agg = { client: string | null; account: string; id: string | null; key: string; nombre: string; tipo: Tipo; ident: string | null; cantidad: number | null; monto: number | null }
  const agg = new Map<string, Agg>()
  let sinTipo = 0
  const datosBono = new Map<string, { rating: string | null; vencimiento: string | null }>()
  for (const f of validas) {
    const nombre = f.nombre.toString().trim()
    const tipo = tipoDesdeProducto(f.producto, nombre) ?? (() => { sinTipo++; return 'fondo' as Tipo })()
    const ref = await resolverInstrumento({ tipo, nombre, isin: f.isin, cusip: f.cusip, symbol: f.symbol }, cache)
    if (tipo === 'bono' && ref.id && (f.rating || f.vencimiento)) {
      datosBono.set(ref.id, { rating: f.rating?.toString().trim() || null, vencimiento: fechaIso(f.vencimiento) })
    }
    const account = f.account.toString().trim().toUpperCase()
    const client = clientePorCuenta.get(account) ?? null
    const k = `${account}|${ref.key}`
    const prev = agg.get(k)
    const cantidad = parseNumero(f.cantidad)
    const monto = parseNumero(f.monto)
    if (prev) {
      prev.cantidad = (prev.cantidad ?? 0) + (cantidad ?? 0)
      prev.monto = (prev.monto ?? 0) + (monto ?? 0)
    } else {
      agg.set(k, {
        client, account, id: ref.id, key: ref.key, nombre, tipo,
        ident: f.isin?.toString().trim() || f.cusip?.toString().trim() || f.symbol?.toString().trim() || null,
        cantidad, monto,
      })
    }
  }

  // Rating y vencimiento de los bonos: completan el maestro (sin pisar lo cargado)
  for (const [id, d] of Array.from(datosBono.entries())) {
    await pool.query(
      `update instrument_master
          set rating = coalesce(nullif(rating, ''), $1),
              maturity_date = coalesce(maturity_date, $2::date)
        where id = $3`,
      [d.rating, d.vencimiento, id]
    ).catch(() => {})   // columnas de bono sin migrar
  }
  if (datosBono.size > 0) await reclassifyInstrumentsSafe(Array.from(datosBono.keys()))

  const clientes = Array.from(new Set(Array.from(clientePorCuenta.values()).filter((c): c is string => !!c)))
  const db = await pool.connect()
  try {
    await db.query('begin')
    const { rows: [load] } = await db.query(
      `insert into client_position_loads (file_name, fecha_datos, filas, cuentas, sin_cliente, loaded_by)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [meta.fileName ?? null, meta.fechaDatos || null, validas.length, cuentas.length, cuentasSinCliente.length, meta.user]
    )
    // La carga reemplaza las cuentas que trae, y las posiciones que habían
    // nacido de órdenes de esos clientes (ya están reflejadas en la foto nueva).
    await db.query(`delete from client_positions where upper(account_number) = any($1::text[])`, [cuentas])
    if (clientes.length > 0) {
      await db.query(`delete from client_positions where account_number is null and client_number = any($1::text[])`, [clientes])
    }
    for (const a of Array.from(agg.values())) {
      await db.query(
        `insert into client_positions
           (client_number, account_number, instrument_id, instrument_key, nombre, tipo_activo, identificador, cantidad, monto, origen, load_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'carga', $10)`,
        [a.client, a.account, a.id, a.key, a.nombre, a.tipo, a.ident, a.cantidad, a.monto, load.id]
      )
    }
    await db.query('commit')
    return {
      loadId: load.id, filas: validas.length, posiciones: agg.size, cuentas: cuentas.length,
      cuentasSinCliente, clientes: clientes.length, sinTipo,
    }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

// ── Ajuste por órdenes ejecutadas ────────────────────────────────────────────

export interface ItemOrden {
  index: number
  operacion: 'compra' | 'venta'
  tipo: Tipo
  nombre: string
  ident: string | null
  symbol: string | null
  cantidad: number | null     // acciones o valor nominal
  monto: number | null        // monto explícito (fondos, acciones "por $")
  total: boolean              // vender toda la posición
}

export function itemsDeSolicitud(sol: any): ItemOrden[] {
  let assets: any[] = []
  try {
    assets = Array.isArray(sol.assets_json) ? sol.assets_json
      : typeof sol.assets_json === 'string' ? JSON.parse(sol.assets_json) : []
  } catch { assets = [] }

  const opDe = (v: unknown): 'compra' | 'venta' => (String(v ?? sol.tipo_operacion).toLowerCase() === 'venta' ? 'venta' : 'compra')

  if (assets.length === 0) {
    const tipo: Tipo = /bono/.test(sol.instrumento_tipo ?? '') ? 'bono' : /fondo/.test(sol.instrumento_tipo ?? '') ? 'fondo' : 'accion'
    return [{
      index: 0, operacion: opDe(sol.tipo_operacion), tipo,
      nombre: sol.instrumento_nombre ?? sol.symbol ?? '',
      ident: sol.cusip_isin ?? null, symbol: sol.symbol ?? null,
      cantidad: parseNumero(sol.cantidad), monto: parseNumero(sol.monto), total: false,
    }]
  }

  return assets.map((a, index): ItemOrden | null => {
    if (a?.cancelada) return null
    const total = String(a.cantidad ?? '').toUpperCase() === 'TOTAL'
    if (a.type === 'acciones') {
      const porMonto = a.cantidadTipo === 'monto'
      return {
        index, operacion: opDe(a.operacion), tipo: 'accion', nombre: a.nombre || a.ticker || '',
        ident: null, symbol: a.ticker || null,
        cantidad: total || porMonto ? null : parseNumero(a.cantidad),
        monto: porMonto && !total ? parseNumero(a.cantidad) : null, total,
      }
    }
    if (a.type === 'fondos') {
      return {
        index, operacion: opDe(a.operacion), tipo: 'fondo', nombre: a.fondo || '',
        ident: a.cusipIsin || null, symbol: null, cantidad: null, monto: parseNumero(a.monto), total,
      }
    }
    return {
      index, operacion: opDe(a.operacion), tipo: 'bono', nombre: a.descripcion || '',
      ident: a.cusipIsin || null, symbol: null,
      cantidad: total ? null : parseNumero(a.cantidad), monto: null, total,
    }
  }).filter((x): x is ItemOrden => x !== null && !!(x.nombre || x.ident || x.symbol))
}

/**
 * Aplica una solicitud ejecutada a las posiciones del cliente. Es idempotente:
 * cada activo de la orden se aplica una sola vez (client_position_movements).
 * Nunca debería frenar la ejecución de la orden: quien la llama atrapa errores.
 */
export async function applySolicitudEjecutada(sol: any): Promise<{ aplicados: number; omitidos: number }> {
  let clientNumber: string | null = sol.client_number?.toString().trim() || null
  if (!clientNumber && sol.client_id) {
    const { rows } = await pool.query(`select client_number from clients where id = $1`, [sol.client_id])
    clientNumber = rows[0]?.client_number ?? null
  }
  const items = itemsDeSolicitud(sol)
  const valorEfectivo = parseNumero(sol.valor_efectivo)
  const precio = parseNumero(sol.precio_ejecutado)
  const cache = new Map<string, { id: string | null; key: string }>()
  let aplicados = 0, omitidos = 0

  for (const it of items) {
    const isIsin = it.ident && ISIN_RE.test(it.ident.trim().toUpperCase())
    const ref = await resolverInstrumento({
      tipo: it.tipo, nombre: it.nombre,
      isin: isIsin ? it.ident : null, cusip: isIsin ? null : it.ident, symbol: it.symbol,
    }, cache)

    const db = await pool.connect()
    try {
      await db.query('begin')
      const mov = await db.query(
        `insert into client_position_movements
           (client_number, solicitud_id, item_index, instrument_id, instrument_key, nombre, operacion, total_posicion, aplicado)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict do nothing returning id`,
        [clientNumber, sol.id, it.index, ref.id, ref.key, it.nombre, it.operacion, it.total, !!clientNumber]
      )
      if (mov.rows.length === 0) { await db.query('rollback'); omitidos++; continue }   // ya aplicada
      const movId = mov.rows[0].id
      if (!clientNumber) {
        await db.query(`update client_position_movements set nota = 'Orden sin número de cliente: no se aplicó' where id = $1`, [movId])
        await db.query('commit'); omitidos++; continue
      }

      const { rows: pos } = await db.query(
        `select id, cantidad, monto from client_positions
          where client_number = $1 and instrument_key = $2
          order by monto desc nulls last for update`,
        [clientNumber, ref.key]
      )
      const posCant = pos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0)
      const posMonto = pos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
      const unitario = posCant > 0 && posMonto > 0 ? posMonto / posCant : null
      // Valor efectivo total de la orden solo se puede atribuir si tiene un único activo
      const montoEjecutado = items.length === 1 ? valorEfectivo : null
      const valorPorPrecio = (q: number | null) =>
        q != null && precio != null && items.length === 1 ? (it.tipo === 'bono' ? (q * precio) / 100 : q * precio) : null

      let dCant: number | null = null, dMonto: number | null = null, nota: string | null = null

      if (it.operacion === 'venta' && it.total) {
        dCant = posCant || null; dMonto = posMonto || null
        await db.query(`delete from client_positions where client_number = $1 and instrument_key = $2`, [clientNumber, ref.key])
        if (pos.length === 0) nota = 'Venta total sin posición registrada'
      } else if (it.operacion === 'venta') {
        const m = montoEjecutado ?? it.monto
        dCant = it.cantidad ?? (m != null && unitario ? m / unitario : null)
        // Se descuenta a valor de libro de la posición, para que el peso quede coherente
        dMonto = dCant != null && unitario ? dCant * unitario : m ?? valorPorPrecio(it.cantidad)
        if (pos.length === 0) {
          nota = 'Venta sin posición registrada'
        } else {
          let restCant = dCant ?? 0, restMonto = dMonto ?? 0
          for (const p of pos) {
            if (restCant <= 0 && restMonto <= 0) break
            const c = Number(p.cantidad) || 0, mo = Number(p.monto) || 0
            const quitaC = Math.min(c, restCant), quitaM = Math.min(mo, restMonto)
            const nc = c - quitaC, nm = mo - quitaM
            restCant -= quitaC; restMonto -= quitaM
            if ((c > 0 && nc <= 1e-9) || (c === 0 && nm <= 0.005)) {
              await db.query(`delete from client_positions where id = $1`, [p.id])
            } else {
              await db.query(
                `update client_positions set cantidad = $1, monto = $2, updated_at = now() where id = $3`,
                [c > 0 ? nc : p.cantidad, nm, p.id]
              )
            }
          }
          if (dCant == null && dMonto == null) nota = 'Sin cantidad ni monto: no se pudo descontar'
        }
      } else {
        dMonto = montoEjecutado ?? it.monto ?? (it.cantidad != null && unitario ? it.cantidad * unitario : null) ?? valorPorPrecio(it.cantidad)
        dCant = it.cantidad ?? (dMonto != null && unitario ? dMonto / unitario : null)
        if (dMonto == null) nota = 'Sin monto: la compra no suma al riesgo hasta la próxima carga'
        if (pos[0]) {
          await db.query(
            `update client_positions
                set cantidad = coalesce(cantidad, 0) + coalesce($1, 0),
                    monto = coalesce(monto, 0) + coalesce($2, 0), updated_at = now()
              where id = $3`,
            [dCant, dMonto, pos[0].id]
          )
        } else {
          await db.query(
            `insert into client_positions
               (client_number, account_number, instrument_id, instrument_key, nombre, tipo_activo, identificador, cantidad, monto, origen)
             values ($1, null, $2, $3, $4, $5, $6, $7, $8, 'orden')`,
            [clientNumber, ref.id, ref.key, it.nombre || it.symbol || it.ident, it.tipo, it.ident ?? it.symbol, dCant, dMonto]
          )
        }
      }

      await db.query(
        `update client_position_movements set cantidad = $1, monto = $2, nota = $3 where id = $4`,
        [dCant, dMonto, nota, movId]
      )
      await db.query('commit')
      aplicados++
    } catch (e) {
      await db.query('rollback').catch(() => {})
      throw e
    } finally {
      db.release()
    }
  }
  return { aplicados, omitidos }
}

// ── Riesgo del cliente ───────────────────────────────────────────────────────

export interface PosicionConRiesgo {
  account_number?: string | null
  nombre: string
  tipo_activo: string | null
  cantidad: number | null
  monto: number | null
  grupo: RiskGroup | null
  puntaje: number | null
  origen: string
}

export interface RiesgoCliente extends RiesgoCartera {
  perfilAsignado: PerfilCliente | null
  perfilFuente: 'ficha_cliente' | 'banco_central' | null
  tope: number | null
  estado: EstadoPerfil
  posiciones: PosicionConRiesgo[]
  /** Riesgo por cuenta (las posiciones sin cuenta van con account_number null) */
  cuentas: (RiesgoCartera & { account_number: string | null; estado: EstadoPerfil; posiciones: PosicionConRiesgo[] })[]
  ultimaCarga: string | null
  ultimoMovimiento: string | null
}

const POSICIONES_SQL = `
  select p.client_number, upper(p.account_number) as account_number, p.nombre, p.tipo_activo, p.cantidad, p.monto, p.origen,
         case when p.tipo_activo = 'cash' then 'liquidez' else im.riesgo_grupo end as grupo,
         case when p.tipo_activo = 'cash' then 1 else im.riesgo_puntaje end as puntaje
    from client_positions p
    left join instrument_master im on im.id = p.instrument_id`

// Perfil del cuestionario del Banco Central (bc_fichas) como respaldo del
// perfil cargado en la ficha del cliente. La tabla no está en las migraciones
// versionadas, así que se verifica que exista antes de usarla.
let bcFichasExiste: boolean | null = null
async function perfilBcSql(alias: string) {
  if (bcFichasExiste === null) {
    const { rows } = await pool.query(`select to_regclass('public.bc_fichas') is not null as ok`)
    bcFichasExiste = !!rows[0]?.ok
  }
  return bcFichasExiste
    ? `(select f.perfil_result from bc_fichas f
          where f.client_id = ${alias}.id and f.perfil_result is not null
          order by f.updated_at desc limit 1)`
    : 'null::text'
}

async function perfilAsignadoDe(clientNumber: string) {
  const { rows } = await pool.query(
    `select c.risk_profile, ${await perfilBcSql('c')} as perfil_bc
       from clients c where c.client_number = $1 limit 1`,
    [clientNumber]
  )
  const r = rows[0]
  if (isPerfilCliente(r?.risk_profile)) return { perfil: r.risk_profile as PerfilCliente, fuente: 'ficha_cliente' as const }
  if (isPerfilCliente(r?.perfil_bc)) return { perfil: r.perfil_bc as PerfilCliente, fuente: 'banco_central' as const }
  return { perfil: null, fuente: null }
}

export async function getRiesgoCliente(clientNumber: string): Promise<RiesgoCliente> {
  const [{ perfil, fuente }, posRes, fechas] = await Promise.all([
    perfilAsignadoDe(clientNumber),
    pool.query(`${POSICIONES_SQL} where p.client_number = $1 order by p.monto desc nulls last`, [clientNumber]),
    pool.query(
      `select (select max(l.loaded_at) from client_positions p join client_position_loads l on l.id = p.load_id where p.client_number = $1) as carga,
              (select max(created_at) from client_position_movements where client_number = $1 and aplicado) as movimiento`,
      [clientNumber]
    ),
  ])
  const posiciones: PosicionConRiesgo[] = posRes.rows.map(r => ({
    account_number: r.account_number ?? null, nombre: r.nombre, tipo_activo: r.tipo_activo, cantidad: r.cantidad, monto: r.monto,
    grupo: r.grupo, puntaje: r.puntaje, origen: r.origen,
  }))
  const cartera = calcularRiesgoCartera(posiciones)
  const porCuenta = new Map<string | null, PosicionConRiesgo[]>()
  for (const p of posiciones) {
    const k = p.account_number ?? null
    porCuenta.set(k, [...(porCuenta.get(k) ?? []), p])
  }
  const cuentas = Array.from(porCuenta.entries())
    .map(([account_number, pos]) => {
      const c = calcularRiesgoCartera(pos)
      return { ...c, account_number, estado: compararConPerfil(perfil, c.puntaje), posiciones: pos }
    })
    .sort((a, b) => b.montoTotal - a.montoTotal)
  return {
    ...cartera,
    cuentas,
    perfilAsignado: perfil,
    perfilFuente: fuente,
    tope: perfil ? PERFIL_CLIENTE[perfil].tope : null,
    estado: compararConPerfil(perfil, cartera.puntaje),
    posiciones,
    ultimaCarga: fechas.rows[0]?.carga ?? null,
    ultimoMovimiento: fechas.rows[0]?.movimiento ?? null,
  }
}

export interface ResumenClienteRiesgo {
  clientId: string | null
  clientNumber: string
  nombre: string
  asesor: string | null
  perfilAsignado: PerfilCliente | null
  puntaje: number | null
  estado: EstadoPerfil
  montoTotal: number
  pctSinClasificar: number
}

/** Todos los clientes con posiciones, con su riesgo vs. perfil (para la mesa). */
export async function listRiesgoClientes(): Promise<{ clientes: ResumenClienteRiesgo[]; sinCliente: { cuentas: number; monto: number } ; ultimaCarga: any }> {
  const perfilBc = await perfilBcSql('c')
  const [posRes, cliRes, sinCli, carga] = await Promise.all([
    pool.query(`${POSICIONES_SQL} where p.client_number is not null`),
    pool.query(
      `select c.id, c.client_number, trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as nombre,
              c.advisor, c.risk_profile, ${perfilBc} as perfil_bc
         from clients c
        where c.client_number in (select distinct client_number from client_positions where client_number is not null)`
    ),
    pool.query(`select count(distinct account_number)::int as cuentas, coalesce(sum(monto), 0) as monto from client_positions where client_number is null`),
    pool.query(`select * from client_position_loads order by loaded_at desc limit 1`),
  ])
  const porCliente = new Map<string, PosicionConRiesgo[]>()
  for (const r of posRes.rows) {
    const arr = porCliente.get(r.client_number) ?? []
    arr.push({ nombre: r.nombre, tipo_activo: r.tipo_activo, cantidad: r.cantidad, monto: r.monto, grupo: r.grupo, puntaje: r.puntaje, origen: r.origen })
    porCliente.set(r.client_number, arr)
  }
  const info = new Map(cliRes.rows.map(r => [r.client_number, r]))
  const clientes: ResumenClienteRiesgo[] = Array.from(porCliente.entries()).map(([num, pos]) => {
    const c = info.get(num)
    const perfil = isPerfilCliente(c?.risk_profile) ? c.risk_profile : isPerfilCliente(c?.perfil_bc) ? c.perfil_bc : null
    const cartera = calcularRiesgoCartera(pos)
    const sinClasif = cartera.composicion.find(x => x.grupo === 'sin_clasificar')?.pct ?? 0
    return {
      clientId: c?.id ?? null, clientNumber: num, nombre: c?.nombre || num, asesor: c?.advisor ?? null,
      perfilAsignado: perfil, puntaje: cartera.puntaje, estado: compararConPerfil(perfil, cartera.puntaje),
      montoTotal: cartera.montoTotal, pctSinClasificar: sinClasif,
    }
  })
  const orden: Record<EstadoPerfil, number> = { excedido: 0, sin_perfil: 1, sin_posiciones: 2, dentro: 3 }
  clientes.sort((a, b) => orden[a.estado] - orden[b.estado] || b.montoTotal - a.montoTotal)
  return {
    clientes,
    sinCliente: { cuentas: sinCli.rows[0]?.cuentas ?? 0, monto: Number(sinCli.rows[0]?.monto ?? 0) },
    ultimaCarga: carga.rows[0] ?? null,
  }
}

