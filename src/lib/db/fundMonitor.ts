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
  sort_order: number | null
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
    `select * from fund_monitor_funds where active = true order by sort_order`
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
    order by f.sort_order
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
}, fetchedAt?: Date | null) {
  await pool.query(
    `insert into fund_monitor_returns
       (fund_id, as_of_date, r_ytd, r_1y, r_3y, r_5y, y_2025, y_2024, y_2023, y_2022, y_2021, source, status, error_message, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'davinci','ok',null,coalesce($12, now()))
     on conflict (fund_id) do update set
       as_of_date=excluded.as_of_date, r_ytd=excluded.r_ytd, r_1y=excluded.r_1y, r_3y=excluded.r_3y, r_5y=excluded.r_5y,
       y_2025=excluded.y_2025, y_2024=excluded.y_2024, y_2023=excluded.y_2023, y_2022=excluded.y_2022, y_2021=excluded.y_2021,
       source='davinci', status='ok', error_message=null, fetched_at=excluded.fetched_at`,
    [fundId, data.as_of_date, data.r_ytd, data.r_1y, data.r_3y, data.r_5y, data.y_2025, data.y_2024, data.y_2023, data.y_2022, data.y_2021, fetchedAt ?? null]
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

// Sin filtrar por status: un error puntual del último sync deja los valores
// buenos anteriores intactos (ver markFundSyncIssue), y filtrar mandaba esos
// fondos a una búsqueda en vivo en Davinci innecesaria.
// Usado por Propuestas para autocompletar los rendimientos de un fondo al
// elegirlo (o tipear su ISIN) — mismo ISIN que ya identifica al fondo en el
// maestro de instrumentos, así que sirve de clave de cruce directa.
export async function getFundReturnsByIsin(isin: string) {
  const { rows } = await pool.query(
    `select f.nombre, r.r_ytd, r.r_1y, r.r_3y, r.r_5y,
            r.y_2025, r.y_2024, r.y_2023, r.y_2022, r.y_2021
     from fund_monitor_funds f
     join fund_monitor_returns r on r.fund_id = f.id
     where f.isin = $1`,
    [isin]
  )
  return rows[0] ?? null
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

// ── Límite de consultas a Davinci ────────────────────────────────────────────
// Se guarda en la base (no en memoria) para que un deploy o reinicio no vuelva
// a disparar el sync ni las búsquedas en vivo.

export async function getSyncState(key: string): Promise<{ last_attempt_at: Date | null; last_success_at: Date | null }> {
  const { rows } = await pool.query(
    `select last_attempt_at, last_success_at from davinci_sync_state where key = $1`,
    [key]
  )
  return rows[0] ?? { last_attempt_at: null, last_success_at: null }
}

export async function markSyncAttempt(key: string, success: boolean) {
  await pool.query(
    `insert into davinci_sync_state (key, last_attempt_at, last_success_at)
     values ($1, now(), case when $2 then now() end)
     on conflict (key) do update set
       last_attempt_at = now(),
       last_success_at = case when $2 then now() else davinci_sync_state.last_success_at end`,
    [key, success]
  )
}

export async function getLookupCache(isin: string): Promise<{ data: unknown; fetched_at: Date } | null> {
  const { rows } = await pool.query(
    `select data, fetched_at from davinci_lookup_cache where isin = $1`,
    [isin]
  )
  return rows[0] ?? null
}

export async function setLookupCache(isin: string, data: unknown) {
  await pool.query(
    `insert into davinci_lookup_cache (isin, data, fetched_at) values ($1, $2, now())
     on conflict (isin) do update set data = excluded.data, fetched_at = now()`,
    [isin, data == null ? null : JSON.stringify(data)]
  )
}

/** Último resultado guardado de cada fondo del Monitor (para no volver a bajar lo que está vigente). */
export async function getReturnsFetched(): Promise<Map<string, { status: string; fetched_at: Date | null }>> {
  const { rows } = await pool.query(`select fund_id, status, fetched_at from fund_monitor_returns`)
  return new Map(rows.map((r) => [r.fund_id as string, { status: r.status, fetched_at: r.fetched_at }]))
}

/** Búsquedas guardadas en davinci_lookup_cache para varios ISIN. */
export async function getLookupCaches(isins: string[]): Promise<Map<string, { data: any; fetched_at: Date }>> {
  if (!isins.length) return new Map()
  const { rows } = await pool.query(
    `select upper(isin) as isin, data, fetched_at from davinci_lookup_cache where upper(isin) = any($1)`,
    [isins.map((i) => i.toUpperCase())]
  )
  return new Map(rows.map((r) => [r.isin as string, { data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data, fetched_at: r.fetched_at }]))
}
