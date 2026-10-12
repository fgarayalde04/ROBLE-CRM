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

// CUSIP -> ticker conocido en el maestro de instrumentos (Pershing no trae
// ticker, solo CUSIP).
export async function getCusipTickerMap(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ cusip: string; ticker: string }>(
    `select cusip, ticker from instrument_master
     where coalesce(cusip, '') <> '' and coalesce(ticker, '') <> ''`
  )
  return new Map(rows.map(r => [r.cusip.trim().toUpperCase(), r.ticker.trim().toUpperCase()]))
}

export type PositionsBook = 'iche' | 'albojer'

export interface GenerationHistoryRow {
  id: string
  fileName: string
  createdAt: string
  webUrl: string | null
  downloadable: boolean
  isSeed: boolean
  generatedByName: string | null
  newCloses: number
}

/**
 * Mismas operaciones para cada planilla de acciones (Iche, Albojer): cada una
 * tiene sus propias tablas `<book>_open_positions` / `<book>_closed_positions`
 * / `<book>_generation_log`, con el mismo esquema.
 */
export function positionsStore(book: PositionsBook) {
  const t = { open: `${book}_open_positions`, closed: `${book}_closed_positions`, log: `${book}_generation_log` }

  async function getOpenPositions(): Promise<OpenPosition[]> {
    const { rows } = await pool.query<OpenRow>(
      `select id, analyst, ticker, cusip, description, lots, last_price, source
       from ${t.open} order by analyst, ticker`
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

  async function getClosedPositions(): Promise<ClosedPosition[]> {
    const { rows } = await pool.query<ClosedRow>(
      `select id, analyst, year, ticker, description, opening_date, cost_basis,
              closing_date, quantity, sale_proceeds
       from ${t.closed} order by analyst, year, closing_date`
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

  async function updateLastPrice(ticker: string, analyst: Analyst, lastPrice: number): Promise<void> {
    await pool.query(
      `update ${t.open} set last_price = $1, updated_at = now()
       where ticker = $2 and analyst = $3`,
      [lastPrice, ticker, analyst]
    )
  }

  async function addLotToPosition(ticker: string, analyst: Analyst, lot: Lot, lastPrice: number | null): Promise<void> {
    await pool.query(
      `update ${t.open}
       set lots = lots || $1::jsonb, last_price = coalesce($2, last_price), updated_at = now()
       where ticker = $3 and analyst = $4`,
      [JSON.stringify([lot]), lastPrice, ticker, analyst]
    )
  }

  async function fixPosition(id: string, newTicker: string | null, newLots: Lot[] | null): Promise<void> {
    await pool.query(
      `update ${t.open}
       set ticker = coalesce($2, ticker), lots = coalesce($3::jsonb, lots), updated_at = now()
       where id = $1`,
      [id, newTicker, newLots ? JSON.stringify(newLots) : null]
    )
  }

  async function createOpenPosition(pos: Omit<OpenPosition, 'id'>): Promise<void> {
    await pool.query(
      `insert into ${t.open} (analyst, ticker, cusip, description, lots, last_price, source)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [pos.analyst, pos.ticker, pos.cusip, pos.description, JSON.stringify(pos.lots), pos.lastPrice, pos.source]
    )
  }

  async function backfillCusip(ticker: string, analyst: Analyst, cusip: string): Promise<void> {
    await pool.query(
      `update ${t.open} set cusip = $1 where ticker = $2 and analyst = $3 and cusip is null`,
      [cusip, ticker, analyst]
    )
  }

  async function closePosition(ticker: string, analyst: Analyst, year: number, details: {
    openingDate: string
    costBasis: number
    closingDate: string
    quantity: number
    saleProceeds: number
    description: string
  }): Promise<void> {
    // La transacción tiene que ir en una sola conexión (no en el pool).
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `insert into ${t.closed}
           (analyst, year, ticker, description, opening_date, cost_basis, closing_date, quantity, sale_proceeds)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [analyst, year, ticker, details.description, details.openingDate, details.costBasis, details.closingDate, details.quantity, details.saleProceeds]
      )
      await client.query(`delete from ${t.open} where ticker = $1 and analyst = $2`, [ticker, analyst])
      await client.query('commit')
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  }

  // Cierre de una compraventa del período: se agrega a cerradas sin tocar las
  // abiertas (o no había posición, o sigue abierta con la misma cantidad).
  async function insertClosedPosition(ticker: string, analyst: Analyst, year: number, details: {
    openingDate: string
    costBasis: number
    closingDate: string
    quantity: number
    saleProceeds: number
    description: string
  }): Promise<void> {
    await pool.query(
      `insert into ${t.closed}
         (analyst, year, ticker, description, opening_date, cost_basis, closing_date, quantity, sale_proceeds)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [analyst, year, ticker, details.description, details.openingDate, details.costBasis, details.closingDate, details.quantity, details.saleProceeds]
    )
  }

  async function logGeneration(
    fileName: string,
    item: { id: string; webUrl: string | null },
    userId: string | null,
    preview: GenerateResponse['preview'],
    warnings: string[],
    fileData: Buffer | null = null
  ): Promise<void> {
    await pool.query(
      `insert into ${t.log} (file_name, onedrive_item_id, onedrive_web_url, generated_by, preview, warnings, file_data)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [fileName, item.id || null, item.webUrl, userId, JSON.stringify(preview), JSON.stringify(warnings), fileData]
    )
  }

  // Historial de corridas (sin el .xlsx), más nuevas primero. La carga inicial
  // (seed) se marca con "(carga inicial)" en el nombre y no tiene archivo.
  async function listGenerations(): Promise<GenerationHistoryRow[]> {
    const { rows } = await pool.query(
      `select g.id, g.file_name, g.created_at, g.onedrive_web_url,
              (g.file_data is not null or g.onedrive_item_id is not null) as downloadable,
              (g.file_name like '%(carga inicial)') as is_seed, u.name as generated_by_name,
              coalesce(jsonb_array_length(g.preview->'nuevosCierres'), 0) as new_closes
       from ${t.log} g left join crm_users u on u.id = g.generated_by
       order by g.created_at desc`
    )
    return rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      createdAt: new Date(r.created_at).toISOString(),
      webUrl: r.onedrive_web_url,
      downloadable: r.downloadable,
      isSeed: r.is_seed,
      generatedByName: r.generated_by_name,
      newCloses: Number(r.new_closes),
    }))
  }

  async function getGenerationFile(id: string): Promise<{ fileName: string; fileData: Buffer | null; onedriveItemId: string | null } | null> {
    const { rows } = await pool.query(
      `select file_name, file_data, onedrive_item_id from ${t.log} where id = $1`,
      [id]
    )
    const r = rows[0]
    return r ? { fileName: r.file_name, fileData: r.file_data, onedriveItemId: r.onedrive_item_id } : null
  }

  // Última planilla generada, para poder mostrar el preview de nuevo al
  // entrar a la página (sin volver a subir los Excel) — el .xlsx en sí no se
  // guarda acá, ya vive en OneDrive y se linkea con onedrive_web_url.
  async function getLatestGeneration(): Promise<Omit<GenerateResponse, 'fileBase64'> & { generatedAt: string } | null> {
    const { rows } = await pool.query(
      `select file_name, onedrive_item_id, onedrive_web_url, preview, warnings, created_at
       from ${t.log}
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

  // Desde qué fecha (YYYY-MM-DD) mirar el Activity: la última corrida (o el
  // seed inicial) menos un margen, por si el Activity de esa vez se bajó antes
  // de que aparecieran las operaciones de los últimos días. Lo que ya está en
  // cerradas no se repite (mismo ticker, cantidad y fecha de venta).
  async function getPeriodStart(marginDays = 10): Promise<string | null> {
    const { rows } = await pool.query(`select max(created_at) as last from ${t.log}`)
    if (!rows[0]?.last) return null
    const d = new Date(rows[0].last)
    d.setUTCDate(d.getUTCDate() - marginDays)
    return d.toISOString().slice(0, 10)
  }

  return { getOpenPositions, getClosedPositions, updateLastPrice, addLotToPosition, fixPosition, createOpenPosition, backfillCusip, closePosition, insertClosedPosition, logGeneration, getLatestGeneration, getPeriodStart, listGenerations, getGenerationFile }
}

export type PositionsStore = ReturnType<typeof positionsStore>

export const {
  getOpenPositions,
  getClosedPositions,
  updateLastPrice,
  addLotToPosition,
  fixPosition,
  createOpenPosition,
  backfillCusip,
  closePosition,
  insertClosedPosition,
  logGeneration,
  getLatestGeneration,
  getPeriodStart,
  listGenerations,
  getGenerationFile,
} = positionsStore('iche')
