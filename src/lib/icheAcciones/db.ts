import { pool } from '@/lib/db/pool'
import type { Analyst, ClosedPosition, GenerateResponse, Lot, OpenPosition, Source } from './types'

interface OpenRow {
  id: string
  analyst: Analyst
  ticker: string
  cusip: string | null
  description: string
  lots: Lot[]
  last_price: number | null
  source: Source
}

interface ClosedRow {
  id: string
  analyst: Analyst
  year: number
  ticker: string
  description: string
  opening_date: string
  cost_basis: number
  closing_date: string
  quantity: number
  sale_proceeds: number
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const { rows } = await pool.query<OpenRow>(
    `select id, analyst, ticker, cusip, description, lots, last_price, source
     from iche_open_positions order by analyst, ticker`
  )
  return rows.map(r => ({
    id: r.id,
    analyst: r.analyst,
    ticker: r.ticker,
    cusip: r.cusip,
    description: r.description,
    lots: r.lots,
    lastPrice: r.last_price,
    source: r.source,
  }))
}

// CUSIP -> ticker conocido en el maestro de instrumentos (Pershing no trae
// ticker, solo CUSIP).
export async function getCusipTickerMap(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ cusip: string; ticker: string }>(
    `select cusip, ticker from instrument_master
     where coalesce(cusip, '') <> '' and coalesce(ticker, '') <> ''`
  )
  return new Map(rows.map(r => [r.cusip.trim().toUpperCase(), r.ticker.trim().toUpperCase()]))
}

export async function getClosedPositions(): Promise<ClosedPosition[]> {
  const { rows } = await pool.query<ClosedRow>(
    `select id, analyst, year, ticker, description, opening_date, cost_basis,
            closing_date, quantity, sale_proceeds
     from iche_closed_positions order by analyst, year, closing_date`
  )
  return rows.map(r => ({
    id: r.id,
    analyst: r.analyst,
    year: r.year,
    ticker: r.ticker,
    description: r.description,
    openingDate: r.opening_date,
    costBasis: Number(r.cost_basis),
    closingDate: r.closing_date,
    quantity: Number(r.quantity),
    saleProceeds: Number(r.sale_proceeds),
  }))
}

export async function updateLastPrice(ticker: string, analyst: Analyst, lastPrice: number): Promise<void> {
  await pool.query(
    `update iche_open_positions set last_price = $1, updated_at = now()
     where ticker = $2 and analyst = $3`,
    [lastPrice, ticker, analyst]
  )
}

export async function addLotToPosition(ticker: string, analyst: Analyst, lot: Lot, lastPrice: number | null): Promise<void> {
  await pool.query(
    `update iche_open_positions
     set lots = lots || $1::jsonb, last_price = coalesce($2, last_price), updated_at = now()
     where ticker = $3 and analyst = $4`,
    [JSON.stringify([lot]), lastPrice, ticker, analyst]
  )
}

export async function fixPosition(id: string, newTicker: string | null, newLots: Lot[] | null): Promise<void> {
  await pool.query(
    `update iche_open_positions
     set ticker = coalesce($2, ticker), lots = coalesce($3::jsonb, lots), updated_at = now()
     where id = $1`,
    [id, newTicker, newLots ? JSON.stringify(newLots) : null]
  )
}

export async function createOpenPosition(pos: Omit<OpenPosition, 'id'>): Promise<void> {
  await pool.query(
    `insert into iche_open_positions (analyst, ticker, cusip, description, lots, last_price, source)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [pos.analyst, pos.ticker, pos.cusip, pos.description, JSON.stringify(pos.lots), pos.lastPrice, pos.source]
  )
}

export async function backfillCusip(ticker: string, analyst: Analyst, cusip: string): Promise<void> {
  await pool.query(
    `update iche_open_positions set cusip = $1 where ticker = $2 and analyst = $3 and cusip is null`,
    [cusip, ticker, analyst]
  )
}

export async function closePosition(ticker: string, analyst: Analyst, year: number, details: {
  openingDate: string
  costBasis: number
  closingDate: string
  quantity: number
  saleProceeds: number
  description: string
}): Promise<void> {
  await pool.query('begin')
  try {
    await pool.query(
      `insert into iche_closed_positions
         (analyst, year, ticker, description, opening_date, cost_basis, closing_date, quantity, sale_proceeds)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [analyst, year, ticker, details.description, details.openingDate, details.costBasis, details.closingDate, details.quantity, details.saleProceeds]
    )
    await pool.query(`delete from iche_open_positions where ticker = $1 and analyst = $2`, [ticker, analyst])
    await pool.query('commit')
  } catch (err) {
    await pool.query('rollback')
    throw err
  }
}

export async function logGeneration(
  fileName: string,
  item: { id: string; webUrl: string | null },
  userId: string | null,
  preview: GenerateResponse['preview'],
  warnings: string[]
): Promise<void> {
  await pool.query(
    `insert into iche_generation_log (file_name, onedrive_item_id, onedrive_web_url, generated_by, preview, warnings)
     values ($1, $2, $3, $4, $5, $6)`,
    [fileName, item.id || null, item.webUrl, userId, JSON.stringify(preview), JSON.stringify(warnings)]
  )
}

// Última planilla generada, para poder mostrar el preview de nuevo al
// entrar a la página (sin volver a subir los Excel) — el .xlsx en sí no se
// guarda acá, ya vive en OneDrive y se linkea con onedrive_web_url.
export async function getLatestGeneration(): Promise<Omit<GenerateResponse, 'fileBase64'> & { generatedAt: string } | null> {
  const { rows } = await pool.query(
    `select file_name, onedrive_item_id, onedrive_web_url, preview, warnings, created_at
     from iche_generation_log
     where preview is not null
     order by created_at desc
     limit 1`
  )
  const row = rows[0]
  if (!row) return null
  return {
    fileName: row.file_name,
    uploadedItem: { id: row.onedrive_item_id ?? '', webUrl: row.onedrive_web_url },
    preview: row.preview,
    warnings: row.warnings ?? [],
    generatedAt: row.created_at,
  }
}
