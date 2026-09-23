/**
 * Contratos compartidos del wizard "Iche Acciones" (página especial, un solo
 * cliente — ver .claude/plans/effervescent-forging-leaf.md). El Excel nunca
 * se relee: la fuente de verdad son las tablas `iche_open_positions` /
 * `iche_closed_positions`, y el .xlsx se redibuja de cero con exceljs cada
 * vez que se genera.
 */

export type Analyst = 'INDIO' | 'CHINO'
export type Source = 'pershing' | 'morgan'

export interface Lot {
  quantity: number
  unitCost: number
  tradeDate: string | null // YYYY-MM-DD, null cuando la fecha real no aplica
}

export interface OpenPosition {
  id: string
  analyst: Analyst
  ticker: string
  cusip: string | null
  description: string
  lots: Lot[]
  lastPrice: number | null
  source: Source
}

export interface ClosedPosition {
  id: string
  analyst: Analyst
  year: number
  ticker: string
  description: string
  openingDate: string // YYYY-MM-DD o "Multiple"
  costBasis: number
  closingDate: string // YYYY-MM-DD
  quantity: number
  saleProceeds: number
}

export type IcheFileKind =
  | 'pershing_unrealized'
  | 'pershing_activity'
  | 'morgan_holdings'
  | 'morgan_activity'
  | 'unknown'

export interface DetectedFile {
  fileName: string
  kind: IcheFileKind
}

// ── Cambios propuestos por la reconciliación ────────────────────────────────

export type TickerChange =
  | { kind: 'unchanged'; ticker: string; analyst: Analyst; cusip?: string | null }
  | { kind: 'price_update'; ticker: string; analyst: Analyst; newLastPrice: number; cusip?: string | null }
  | {
      kind: 'new_lot'
      ticker: string
      analyst: Analyst
      newLot: Lot
      newLastPrice: number | null
      cusip?: string | null
    }
  | {
      kind: 'closed_matched'
      ticker: string
      analyst: Analyst
      closingDate: string
      quantity: number
      saleProceeds: number
    }
  | {
      kind: 'quantity_mismatch'
      ticker: string
      analyst: Analyst
      oldQuantity: number
      newQuantity: number
    }

export type IcheQuestion =
  | {
      id: string
      type: 'assign_analyst'
      // Pershing no da ticker en este reporte (solo CUSIP+descripción) — para
      // esas filas `suggestedTicker` es el CUSIP a modo de placeholder y el
      // formulario debe dejarlo editable; para Morgan, `suggestedTicker` ya
      // es el ticker real y alcanza con confirmarlo.
      suggestedTicker: string
      tickerEditable: boolean
      cusip: string | null
      description: string
      quantity: number
      unitCost: number
      tradeDate: string | null
      // Lotes reales (fecha y costo de cada compra) y cotización actual, para
      // crear la posición completa sin perder fechas ni Last Price.
      lots: Lot[]
      lastPrice: number | null
      source: Source
    }
  | {
      id: string
      type: 'unmatched_close'
      ticker: string
      description: string
      analyst: Analyst
      lastKnownQuantity: number
    }

export interface ReconcilePlan {
  changes: TickerChange[]
  pendingQuestions: IcheQuestion[]
  warnings: string[]
  inputsFolder: { driveItemId: string; webUrl: string | null } | null
}

export interface ReconcileResponse {
  plan: ReconcilePlan
  needsInput: boolean
}

export interface QuestionAnswer {
  analyst?: Analyst
  ticker?: string // confirmado/corregido por el usuario en 'assign_analyst'
  resolution?: 'closed_with_details' | 'leave_as_is'
  closeDetails?: { closingDate: string; quantity: number; proceeds: number }
}

export interface GenerateRequest {
  plan: ReconcilePlan
  answers: Record<string, QuestionAnswer>
}

export interface PreviewRow {
  ticker: string
  description: string
  quantity: number
  originalTotalCost: number
  marketValue: number
  gainLoss: number
  gainLossPct: number
}

export interface PreviewSummaryRow {
  label: string
  cost: number
  value: number
  gainLoss: number
  gainLossPct: number | null
}

export interface GenerateResponse {
  fileName: string
  uploadedItem: { id: string; webUrl: string | null }
  // El mismo .xlsx ya subido a OneDrive, para descarga directa desde el
  // navegador — solo viene en la respuesta recién generada; un preview
  // recuperado de iche_generation_log no lo guarda (ya está en OneDrive) y
  // ofrece el link a "Abrir en Office Online" en su lugar.
  fileBase64?: string
  preview: {
    resumen: PreviewSummaryRow[]
    abiertasIndio: PreviewRow[]
    abiertasChino: PreviewRow[]
    nuevosCierres: PreviewRow[]
  }
  warnings: string[]
}
