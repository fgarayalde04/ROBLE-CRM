import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

// Import puntual de un backfill ya scrapeado a mano (Davinci) — se corre una
// sola vez desde el navegador de un admin ya logueado, porque el acceso
// directo a Postgres desde el entorno donde corre el asistente está
// bloqueado por red; este endpoint corre en el propio servidor de Railway,
// que no tiene ese problema. Requiere sesión de admin — nunca expuesto sin
// autenticación.
//
// TODO: borrar esta ruta una vez completado el backfill inicial de los 149
// fondos — es de un solo uso, no parte del flujo normal de sync diario.

function parseNum(s: unknown): number | null {
  if (s == null) return null
  const t = String(s).trim()
  if (t === '' || t === '—' || t === '-') return null
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function parseDate(s: unknown): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { results } = await req.json() as { results: { isin: string; cells: string[] | null }[] }
  if (!Array.isArray(results)) {
    return NextResponse.json({ error: 'Falta results[]' }, { status: 400 })
  }

  let ok = 0, noSource = 0, notFound = 0, errors: string[] = []

  for (const item of results) {
    try {
      const fundRes = await pool.query('select id from fund_monitor_funds where isin = $1', [item.isin])
      const fundId = fundRes.rows[0]?.id
      if (!fundId) { notFound++; continue }

      if (!item.cells) {
        await pool.query(
          `insert into fund_monitor_returns (fund_id, source, status, error_message, fetched_at)
           values ($1, 'davinci', 'no_source', 'ISIN no encontrado en Davinci', now())
           on conflict (fund_id) do update set status='no_source', error_message='ISIN no encontrado en Davinci', fetched_at=now()`,
          [fundId]
        )
        noSource++
        continue
      }

      const c = item.cells
      const ytd = parseNum(c[2]), r1a = parseNum(c[3]), r3a = parseNum(c[4]), r5a = parseNum(c[5])
      const y2025 = parseNum(c[6]), y2024 = parseNum(c[7]), y2023 = parseNum(c[8]), y2022 = parseNum(c[9]), y2021 = parseNum(c[10])
      const asOf = parseDate(c[15])

      await pool.query(
        `insert into fund_monitor_returns
           (fund_id, as_of_date, r_ytd, r_1y, r_3y, r_5y, y_2025, y_2024, y_2023, y_2022, y_2021, source, status, error_message, fetched_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'davinci','ok',null,now())
         on conflict (fund_id) do update set
           as_of_date=excluded.as_of_date, r_ytd=excluded.r_ytd, r_1y=excluded.r_1y, r_3y=excluded.r_3y, r_5y=excluded.r_5y,
           y_2025=excluded.y_2025, y_2024=excluded.y_2024, y_2023=excluded.y_2023, y_2022=excluded.y_2022, y_2021=excluded.y_2021,
           source='davinci', status='ok', error_message=null, fetched_at=now()`,
        [fundId, asOf, ytd, r1a, r3a, r5a, y2025, y2024, y2023, y2022, y2021]
      )
      ok++
    } catch (e: any) {
      errors.push(`${item.isin}: ${e.message}`)
    }
  }

  return NextResponse.json({ total: results.length, ok, no_source: noSource, not_found: notFound, errors })
}

// Repara el permiso 'fondos' (retirado) a 'fondos_monitor' en los usuarios
// que todavía lo tengan guardado — de un solo uso, junto con el import.
export async function PATCH() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { rows } = await pool.query(
    `update crm_users set permissions = array_append(array_remove(permissions, 'fondos'), 'fondos_monitor')
     where 'fondos' = any(permissions) returning email`
  )
  return NextResponse.json({ fixed: rows.map(r => r.email) })
}
