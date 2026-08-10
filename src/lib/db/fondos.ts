import { pool } from './pool'

export async function listAssetManagersWithHints() {
  const { rows } = await pool.query(
    `select id, slug, name, domain_hints, keyword_hints from asset_managers`
  )
  return rows
}

export async function getImportedGmailMessageIds(messageIds: string[]) {
  if (messageIds.length === 0) return []
  const { rows } = await pool.query(
    `select gmail_message_id from factsheets where gmail_message_id = ANY($1)`,
    [messageIds]
  )
  return rows.map((r) => r.gmail_message_id as string)
}

export async function findFondoByManagerAndIsin(managerId: string, isin: string) {
  const { rows } = await pool.query(
    `select id from fondos where asset_manager_id = $1 and isin = $2`,
    [managerId, isin]
  )
  return rows[0] ?? null
}

export async function createFondo(managerId: string, name: string, isin: string | null) {
  const { rows } = await pool.query(
    `insert into fondos (asset_manager_id, name, isin) values ($1, $2, $3) returning id`,
    [managerId, name, isin]
  )
  return rows[0]?.id ?? null
}

export async function markFactsheetsNotLatest(fondoId: string) {
  await pool.query(
    `update factsheets set is_latest = false where fondo_id = $1 and is_latest = true`,
    [fondoId]
  )
}

export async function insertFundFactsheet(record: {
  fondo_id: string | null
  asset_manager_id: string
  file_name: string
  pdf_url: string | null
  gmail_message_id?: string | null
  is_latest: boolean
  imported_by: string | null
}) {
  await pool.query(
    `insert into factsheets (fondo_id, asset_manager_id, file_name, pdf_url, gmail_message_id, is_latest, imported_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [record.fondo_id, record.asset_manager_id, record.file_name, record.pdf_url, record.gmail_message_id ?? null, record.is_latest, record.imported_by]
  )
}

export async function listAssetManagersBasic() {
  const { rows } = await pool.query(`select id, slug, name, website from asset_managers`)
  return rows
}

export async function getFondosWithIsin() {
  const { rows } = await pool.query(
    `select id, isin, name, asset_manager_id from fondos where isin is not null`
  )
  return rows
}

export async function getCoveredFondoIds() {
  const { rows } = await pool.query(
    `select fondo_id from factsheets where is_latest = true`
  )
  return rows.map((r) => r.fondo_id as string)
}

export async function getManagersWithStats() {
  const { rows: managers } = await pool.query(
    `select id, slug, name, logo_url from asset_managers order by name`
  )
  if (managers.length === 0) return []

  const { rows: stats } = await pool.query(`
    select f.asset_manager_id, fs.created_at
    from fondos f
    left join factsheets fs on fs.fondo_id = f.id
  `)

  const fundCounts: Record<string, number> = {}
  const latestDates: Record<string, string> = {}

  // Count distinct fondos per manager
  const { rows: fondoRows } = await pool.query(`select id, asset_manager_id from fondos`)
  for (const f of fondoRows) {
    fundCounts[f.asset_manager_id] = (fundCounts[f.asset_manager_id] ?? 0) + 1
  }

  for (const row of stats) {
    if (!row.created_at) continue
    const cur = latestDates[row.asset_manager_id]
    if (!cur || row.created_at > cur) latestDates[row.asset_manager_id] = row.created_at
  }

  const { rows: unclassified } = await pool.query(
    `select asset_manager_id, created_at from factsheets where fondo_id is null`
  )
  for (const fs of unclassified) {
    const cur = latestDates[fs.asset_manager_id]
    if (!cur || fs.created_at > cur) latestDates[fs.asset_manager_id] = fs.created_at
  }

  return managers.map((m) => ({
    ...m,
    fund_count: fundCounts[m.id] ?? 0,
    latest_factsheet: latestDates[m.id] ?? null,
  }))
}

export async function getManagerBySlug(slug: string) {
  const { rows } = await pool.query(
    `select id, slug, name, logo_url from asset_managers where slug = $1`,
    [slug]
  )
  return rows[0] ?? null
}

export async function getFondosForManager(managerId: string) {
  const { rows: fondos } = await pool.query(
    `select id, name, isin, ticker, clase, moneda from fondos where asset_manager_id = $1 order by name`,
    [managerId]
  )
  if (fondos.length === 0) return []

  const fondoIds = fondos.map((f) => f.id)
  const { rows: sheets } = await pool.query(
    `select id, fondo_id, file_name, pdf_url, fecha_factsheet, created_at, is_latest
     from factsheets where fondo_id = ANY($1)`,
    [fondoIds]
  )
  const byFondo = new Map<string, any[]>()
  for (const s of sheets) {
    if (!byFondo.has(s.fondo_id)) byFondo.set(s.fondo_id, [])
    byFondo.get(s.fondo_id)!.push(s)
  }

  return fondos.map((f) => {
    const fondoSheets = byFondo.get(f.id) ?? []
    const latest = fondoSheets.find((s) => s.is_latest) ?? fondoSheets[0] ?? null
    return {
      id: f.id, name: f.name, isin: f.isin, ticker: f.ticker, clase: f.clase, moneda: f.moneda,
      latest_factsheet: latest
        ? { id: latest.id, file_name: latest.file_name, pdf_url: latest.pdf_url, fecha_factsheet: latest.fecha_factsheet, created_at: latest.created_at }
        : null,
      factsheet_count: fondoSheets.length,
    }
  })
}

export async function getLatestFactsheetForIsin(isin: string) {
  const { rows: fondoRows } = await pool.query(`select id, asset_manager_id from fondos where isin = $1`, [isin])
  const fondo = fondoRows[0]
  if (!fondo) return null

  const { rows: fsRows } = await pool.query(
    `select file_name from factsheets where fondo_id = $1 and is_latest = true`,
    [fondo.id]
  )
  const factsheet = fsRows[0]
  if (!factsheet) return null

  const { rows: mgrRows } = await pool.query(
    `select name, slug from asset_managers where id = $1`,
    [fondo.asset_manager_id]
  )
  const manager = mgrRows[0] ?? null

  return { factsheet, manager }
}

export async function getUnclassifiedFactsheets(managerId: string) {
  const { rows } = await pool.query(
    `select id, file_name, pdf_url, fecha_factsheet, created_at
     from factsheets where asset_manager_id = $1 and fondo_id is null order by created_at desc`,
    [managerId]
  )
  return rows
}
