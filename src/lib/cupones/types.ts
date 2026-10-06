// Calendario de Cupones: tipos compartidos entre el parseo del "Incoming Cash"
// (Projected Cash Flow de Pershing), la pantalla de edición y las exportaciones.

/** Un pago tal como viene en el reporte (fila BOND INT). */
export interface ReportPayment {
  payDate: string // YYYY-MM-DD
  amount: number
}

/** Fila del reporte que no es BOND INT (dividendo, vencimiento, rescate…). */
export interface OtherDistribution {
  payDate: string | null
  type: string
  cusip: string
  description: string
  amount: number
}

export type Frequency = 1 | 2 | 4 | 12

/** Bono del calendario. Todo lo que no es `payments`/`description` es editable a mano. */
export interface CouponBond {
  cusip: string
  isin: string | null
  description: string
  issuer: string
  nominal: number
  /** Cupón anual en decimal (0.06224 = 6.224%). */
  couponRate: number
  /** Tasa leída de la descripción ("6.224%"), en decimal; null si no trae. */
  rateFromDescription: number | null
  /** Tasa implícita en los pagos del reporte (anualizada), en decimal. */
  rateFromPayments: number | null
  /** Meses de pago 1–12, ordenados. Su cantidad es la frecuencia (pagos por año). */
  payMonths: number[]
  payDay: number
  /** YYYY-MM-DD; null = perpetuo. */
  maturity: string | null
  /** YYYY-MM-DD; null = sin fecha de call. */
  callDate: string | null
  nonCallable: boolean
  fixedFloat: boolean
  payments: ReportPayment[]
  /** El reporte trae menos pagos que los de un año para este bono: frecuencia a confirmar. */
  needsFrequency: boolean
}

export interface IncomingCashReport {
  accountNumber: string
  accountShortName: string
  baseCcy: string
  asOfDate: string | null // YYYY-MM-DD
  accountTotal: number | null
  bonds: CouponBond[]
  others: OtherDistribution[]
}

export interface CouponCalendar extends IncomingCashReport {
  clientName: string
  advisor: string
  docDate: string // YYYY-MM-DD
}
