import { pool } from './pool'

export interface FundMonitorFund {
  id: string
  isin: string
  nombre: string
  nombre_bloomberg: string | null
  gestora: string | null
  share_class: string | null
  moneda: string | null
  categoria: string | null
  subcategoria: string | null
  inception_date: string | null
}

export interface FundMonitorReturns {
  fund_id: string
  as_of_date: string | null
  nav: number | null
  r_1m: number | null
  r_3m: number | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
  source: string
  status: 'ok' | 'stale' | 'no_source' | 'error'
  error_message: string | null
  fetched_at: string
}

export async function listActiveFunds(): Promise<FundMonitorFund[]> {
  const { rows } = await pool.query(
    `select * from fund_monitor_funds where active = true order by categoria, subcategoria, nombre`
  )
  return rows
}

export async function listFundsWithReturns() {
  const { rows } = await pool.query(`
    select f.*, r.as_of_date, r.r_1m, r.r_3m, r.r_1y, r.r_3y, r.r_5y, r.r_ytd,
           r.y_2025, r.y_2024, r.y_2023, r.y_2022, r.y_2021,
           r.source, r.status, r.error_message, r.fetched_at
    from fund_monitor_funds f
    left join fund_monitor_returns r on r.fund_id = f.id
    where f.active = true
    order by f.categoria, f.subcategoria, f.nombre
  `)
  return rows
}

// Se guarda solo cuando Davinci devuelve un dato válido — nunca pisa un
// snapshot bueno con nulls si la búsqueda falla (ver upsertSyncError).
export async function upsertFundReturns(fundId: string, data: {
  as_of_date: string | null
  r_ytd: number | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
}) {
  await pool.query(
    `insert into fund_monitor_returns
       (fund_id, as_of_date, r_ytd, r_1y, r_3y, r_5y, y_2025, y_2024, y_2023, y_2022, y_2021, source, status, error_message, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'davinci','ok',null,now())
     on conflict (fund_id) do update set
       as_of_date=excluded.as_of_date, r_ytd=excluded.r_ytd, r_1y=excluded.r_1y, r_3y=excluded.r_3y, r_5y=excluded.r_5y,
       y_2025=excluded.y_2025, y_2024=excluded.y_2024, y_2023=excluded.y_2023, y_2022=excluded.y_2022, y_2021=excluded.y_2021,
       source='davinci', status='ok', error_message=null, fetched_at=now()`,
    [fundId, data.as_of_date, data.r_ytd, data.r_1y, data.r_3y, data.r_5y, data.y_2025, data.y_2024, data.y_2023, data.y_2022, data.y_2021]
  )
}

// Fondo sin cobertura en la fuente, o error puntual de scraping — se deja
// registrado el estado, pero los últimos valores buenos (si los hay) quedan
// intactos: nunca se borra información anterior por una falla de hoy.
export async function markFundSyncIssue(fundId: string, status: 'no_source' | 'error', message: string) {
  await pool.query(
    `insert into fund_monitor_returns (fund_id, source, status, error_message, fetched_at)
     values ($1, 'davinci', $2, $3, now())
     on conflict (fund_id) do update set status=$2, error_message=$3, fetched_at=now()`,
    [fundId, status, message]
  )
}

export async function getFundMonitorCoverage() {
  const { rows } = await pool.query(`
    select
      count(*) as total,
      count(*) filter (where r.status = 'ok') as ok,
      count(*) filter (where r.status = 'no_source') as no_source,
      count(*) filter (where r.status = 'error') as error,
      count(*) filter (where r.fund_id is null) as never_synced
    from fund_monitor_funds f
    left join fund_monitor_returns r on r.fund_id = f.id
    where f.active = true
  `)
  return rows[0]
}
