import { pool } from './pool'

export async function searchInstruments(q: string | null, tipo: string | null, limit: number, all: boolean) {
  const where: string[] = [`activo = true`]
  const params: any[] = []
  if (tipo) { params.push(tipo); where.push(`tipo_activo = $${params.length}`) }
  if (q) {
    params.push(`%${q}%`)
    where.push(`(nombre ilike $${params.length} or isin ilike $${params.length} or cusip ilike $${params.length} or ticker ilike $${params.length} or emisor ilike $${params.length})`)
  }
  params.push(all ? 500 : limit)
  const { rows } = await pool.query(
    `select * from instrument_master where ${where.join(' and ')} order by nombre asc limit $${params.length}`,
    params
  )
  return rows
}

export async function createInstrument(record: Record<string, any>) {
  const entries = Object.entries(record).filter(([, v]) => v !== undefined)
  const cols = entries.map(([k]) => `"${k}"`)
  const placeholders = entries.map((_, i) => `$${i + 1}`)
  const values = entries.map(([, v]) => v)
  const { rows } = await pool.query(
    `insert into instrument_master (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values
  )
  return rows[0]
}

export async function updateInstrument(id: string, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update instrument_master set ${setClause.join(', ')} where id = $${values.length} returning *`,
    values
  )
  return rows[0] ?? null
}

export async function findInstrumentByIsin(isin: string) {
  const { rows } = await pool.query(`select id from instrument_master where isin = $1`, [isin])
  return rows[0] ?? null
}

export async function findInstrumentByCusip(cusip: string) {
  const { rows } = await pool.query(`select id from instrument_master where cusip = $1`, [cusip])
  return rows[0] ?? null
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const CUSIP_RE = /^[A-Z0-9]{9}$/

export interface EnsureInstrumentInput {
  tipo_activo: 'fondo' | 'bono'
  nombre: string
  identificador: string           // ISIN o CUSIP tal como lo tipeó el usuario
  moneda?: string | null
  emisor?: string | null
  categoria?: string | null
  maturity_date?: string | null
  coupon?: number | null
  rating?: string | null
  frequency?: string | null
  day_count_convention?: string | null
}

const TERM_COLS = ['maturity_date', 'coupon', 'rating', 'frequency', 'day_count_convention'] as const

// Guarda en el maestro un instrumento cargado a mano (fondo o bono) si todavía
// no está, para que la próxima vez aparezca en el buscador. Si ya existe (mismo
// ISIN/CUSIP) no pisa nada: solo completa los campos que estén vacíos.
// Devuelve null si el identificador no tiene forma de ISIN/CUSIP — sin clave
// confiable no se guarda, para no llenar el maestro de duplicados.
export async function ensureInstrument(input: EnsureInstrumentInput): Promise<{ id: string; created: boolean } | null> {
  const ident = input.identificador.trim().toUpperCase()
  const nombre = input.nombre.trim()
  const isIsin = ISIN_RE.test(ident)
  if (!nombre || nombre.length < 3 || (!isIsin && !CUSIP_RE.test(ident))) return null
  const idCol = isIsin ? 'isin' : 'cusip'

  const terms: Record<string, unknown> = {}
  if (input.tipo_activo === 'bono') {
    for (const c of TERM_COLS) if (input[c] != null && input[c] !== '') terms[c] = input[c]
  }

  const { rows: existing } = await pool.query(`select id from instrument_master where ${idCol} = $1`, [ident])
  if (existing[0]) {
    const sets: string[] = []
    const vals: unknown[] = []
    const fill = (col: string, v: unknown) => {
      if (v == null || v === '') return
      vals.push(v)
      sets.push(`"${col}" = coalesce(nullif("${col}"::text, ''), $${vals.length}::text)::${col === 'maturity_date' ? 'date' : col === 'coupon' ? 'numeric' : 'text'}`)
    }
    fill('emisor', input.emisor)
    fill('categoria', input.categoria)
    for (const [k, v] of Object.entries(terms)) fill(k, v)
    if (sets.length > 0) {
      vals.push(existing[0].id)
      try {
        await pool.query(`update instrument_master set ${sets.join(', ')} where id = $${vals.length}`, vals)
      } catch (e: any) {
        if (e.code !== '42703') throw e   // columnas de bono todavía sin migrar
      }
    }
    return { id: existing[0].id, created: false }
  }

  const base: Record<string, unknown> = {
    tipo_activo: input.tipo_activo,
    nombre,
    [idCol]: ident,
    moneda: input.moneda?.trim() || 'USD',
    emisor: input.emisor?.trim() || null,
    categoria: input.categoria?.trim() || null,
    activo: true,
  }
  try {
    const row = await createInstrument({ ...base, ...terms })
    return { id: row.id, created: true }
  } catch (e: any) {
    if (e.code === '42703') {                // migración de condiciones de bono pendiente
      const row = await createInstrument(base)
      return { id: row.id, created: true }
    }
    if (e.code === '23505') return null      // carrera: otro request lo creó justo antes
    throw e
  }
}
