import { pool } from './pool'
import type { Archivos } from '@/lib/consolidado/calc'
import type { Terminos } from '@/lib/consolidado/types'

/** Lo que hace falta para rearmar el consolidado tal como se dejó. */
export interface DatosConsolidado {
  archivos: Archivos
  fechaManual: string | null
  manuales: Record<string, number>
  externos: Record<string, Terminos>
  incluirMovimientos: boolean
  /** Nombre que se le puso a cada cuenta (clave "banco|n"), si hay varias en un banco. */
  nombresCuentas?: Record<string, string>
}

export interface ConsolidadoRow {
  id: string
  client_name: string
  cuentas: string | null
  valuation_date: string
  total_value: number
  accrued_interest: number
  created_by: string | null
  /** Usuarios (crm_users.id) con los que se compartió. */
  shared_with_ids: string[]
  created_at: string
  updated_at: string
}

const COLS = `id, client_name, cuentas, to_char(valuation_date, 'YYYY-MM-DD') as valuation_date, total_value::float8 as total_value,
              accrued_interest::float8 as accrued_interest, created_by, shared_with_ids, created_at, updated_at`

/** Inserta (sin id) o actualiza (con id). */
export async function saveConsolidado(
  c: { clientName: string; cuentas: string; fecha: string; total: number; cuponCorrido: number; datos: DatosConsolidado },
  opts: { id?: string | null; userName: string; userId: string | null },
): Promise<string> {
  const values = [c.clientName, c.cuentas, c.fecha, Math.round(c.total * 100) / 100, Math.round(c.cuponCorrido * 100) / 100, JSON.stringify(c.datos)]
  if (opts.id) {
    const { rows } = await pool.query(
      `update consolidated_positions set client_name = $1, cuentas = $2, valuation_date = $3, total_value = $4,
              accrued_interest = $5, datos = $6, updated_at = now()
        where id = $7 returning id`,
      [...values, opts.id],
    )
    if (rows[0]) return rows[0].id
  }
  const { rows } = await pool.query(
    `insert into consolidated_positions (client_name, cuentas, valuation_date, total_value, accrued_interest, datos, created_by, created_by_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [...values, opts.userName, opts.userId],
  )
  return rows[0].id
}

export async function getConsolidado(id: string): Promise<(ConsolidadoRow & { datos: DatosConsolidado }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { rows } = await pool.query(`select ${COLS}, datos from consolidated_positions where id = $1`, [id])
  return rows[0] ?? null
}

/** Los que armó ese usuario y los que le compartieron. */
export async function listConsolidados(filter: { creadoPor: string; userId?: string | null; limit?: number }): Promise<ConsolidadoRow[]> {
  const { rows } = await pool.query(
      `select ${COLS} from consolidated_positions
        where created_by = $1 or ($2::uuid is not null and $2::uuid = any(shared_with_ids))
        order by updated_at desc limit $3`,
      [filter.creadoPor, filter.userId ?? null, filter.limit ?? 300],
    )
  return rows
}

export async function deleteConsolidado(id: string) {
  await pool.query(`delete from consolidated_positions where id = $1`, [id])
}

export async function setCompartido(id: string, userIds: string[]) {
  await pool.query(`update consolidated_positions set shared_with_ids = $2::uuid[] where id = $1`, [id, userIds])
}

type Sesion = { name: string; id?: string | null }

/** Lo ven y lo editan quien lo armó y los usuarios con los que lo compartió (dirección no ve todo). */
export function puedeVerConsolidado(row: Pick<ConsolidadoRow, 'created_by' | 'shared_with_ids'>, s: Sesion) {
  return row.created_by === s.name || (!!s.id && (row.shared_with_ids ?? []).includes(s.id))
}

/** Compartir y borrar: solo quien lo armó. */
export function esDuenoConsolidado(row: Pick<ConsolidadoRow, 'created_by'>, s: Sesion) {
  return row.created_by === s.name
}
