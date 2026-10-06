import { pool } from './pool'
import { summarize } from '@/lib/cupones/calc'
import type { CouponCalendar } from '@/lib/cupones/types'

export interface CouponCalendarRow {
  id: string
  client_id: string | null
  account_number: string
  client_name: string
  advisor: string | null
  doc_date: string
  as_of_date: string | null
  bonds_count: number
  nominal_total: number
  annual_income: number
  created_by: string | null
  created_at: string
  updated_at: string
}

const COLS = `id, client_id, account_number, client_name, advisor, doc_date, as_of_date, bonds_count,
              nominal_total, annual_income, created_by, created_at, updated_at`

/** Cliente dueño de la cuenta Pershing (maestro de cuentas → número de cliente). */
export async function findClientByAccount(accountNumber: string): Promise<{ id: string; name: string; advisor: string | null } | null> {
  const { rows } = await pool.query(
    `select c.id, trim(concat_ws(' ', c.first_name, c.last_name)) as name, c.advisor
       from monitoring_base_accounts a
       join clients c on trim(c.client_number::text) = trim(a.client_code::text)
      where upper(a.account_number) = upper($1)
      order by c.status = 'inactivo', c.created_at
      limit 1`,
    [accountNumber],
  ).catch(() => ({ rows: [] as any[] }))
  return rows[0] ?? null
}

/** Inserta (sin id) o actualiza (con id) — exportar Excel y después PDF deja un solo registro. */
export async function saveCouponCalendar(
  cal: CouponCalendar,
  opts: { id?: string | null; clientId: string | null; userName: string; userId: string | null },
): Promise<string> {
  const s = summarize(cal)
  const values = [
    opts.clientId, cal.accountNumber, cal.clientName, cal.advisor, cal.docDate, cal.asOfDate,
    cal.bonds.length, Math.round(s.nominal * 100) / 100, Math.round(s.annual * 100) / 100, JSON.stringify(cal),
  ]
  if (opts.id) {
    const { rows } = await pool.query(
      `update coupon_calendars set client_id = $1, account_number = $2, client_name = $3, advisor = $4, doc_date = $5,
              as_of_date = $6, bonds_count = $7, nominal_total = $8, annual_income = $9, datos = $10, updated_at = now()
        where id = $11 returning id`,
      [...values, opts.id],
    )
    if (rows[0]) return rows[0].id
  }
  const { rows } = await pool.query(
    `insert into coupon_calendars (client_id, account_number, client_name, advisor, doc_date, as_of_date, bonds_count,
                                   nominal_total, annual_income, datos, created_by, created_by_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [...values, opts.userName, opts.userId],
  )
  return rows[0].id
}

export async function getCouponCalendar(id: string): Promise<(CouponCalendarRow & { datos: CouponCalendar }) | null> {
  const { rows } = await pool.query(`select ${COLS}, datos from coupon_calendars where id = $1`, [id])
  return rows[0] ?? null
}

export async function listCouponCalendars(filter: { clientId?: string; limit?: number } = {}): Promise<CouponCalendarRow[]> {
  const { rows } = filter.clientId
    ? await pool.query(`select ${COLS} from coupon_calendars where client_id = $1 order by created_at desc limit $2`, [filter.clientId, filter.limit ?? 50])
    : await pool.query(`select ${COLS} from coupon_calendars order by created_at desc limit $1`, [filter.limit ?? 200])
  return rows
}

export async function deleteCouponCalendar(id: string) {
  await pool.query(`delete from coupon_calendars where id = $1`, [id])
}
