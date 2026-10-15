// Datos del PDF de Portafolio (formato estado de cuenta) a partir de lo que ya
// calcula la pantalla de la cuenta: así el PDF muestra los mismos números.
import type {
  PortfolioAccountInfo, PortfolioCashProjectionRow, PortfolioImportRow, PortfolioPerformanceRow, PortfolioPositionRow, PortfolioUnrealizedGainLossRow,
} from '@/types/portfolio'
import type { PdfSections } from '@/components/portfolio/PdfOptionsModal'
import { ASSET_CLASS_ES, assetClassRank, computeInitialAccountValue, computePerfValueSeries } from '@/lib/portfolio/engine'
import { cleanDisplayName, monthLabel } from '@/lib/portfolio/theme'
import type { DatosPdfPortafolio, FilaPdf } from '@/lib/portfolio/estadoCuenta'

const iso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const ddmmyyyy = (s: string) => (iso(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s)

/** "Compra 31/07/2026" o "Compras 24/11/2025, 27/02/2026 y 31/07/2026".
 *  Acepta ISO o dd/mm/aaaa separadas por coma; descarta las anteriores a 1950
 *  (Morgan usa 12/31/1899 cuando no tiene la fecha). */
export function textoCompras(raw: string | null | undefined) {
  const fechas = Array.from(new Set((raw ?? '').split(',').map((x) => x.trim()).filter(Boolean)))
    .filter((x) => { const y = Number(iso(x) ? x.slice(0, 4) : x.slice(-4)); return !(y < 1950) })
    .map(ddmmyyyy)
  if (!fechas.length) return ''
  if (fechas.length === 1) return `Compra ${fechas[0]}`
  return `Compras ${fechas.slice(0, -1).join(', ')} y ${fechas[fechas.length - 1]}`
}

const TIPO_FLUJO = (t: string | null) => {
  const s = (t ?? '').toUpperCase()
  if (/INT|COUPON|CUP/.test(s)) return 'Cupón'
  if (/DIV/.test(s)) return 'Dividendo'
  if (/MAT|PRINC|REDEM/.test(s)) return 'Vencimiento'
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : 'Cobro'
}

function sumarMeses(fecha: string, n: number) {
  const d = new Date(`${fecha.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

/** Nombre del cliente para mostrar: ficha de la cuenta, o el que se escribió al
 *  importar; nunca el número de cuenta (las cuentas sin número se guardan con
 *  el nombre del cliente como clave, y esa sí sirve). */
export function nombreCliente(account: PortfolioAccountInfo | null, importRow: { client_name?: string | null } | null, accountNumber: string) {
  return account?.clientName || account?.accountName || importRow?.client_name?.trim()
    || (/\d{4,}/.test(accountNumber) ? '' : accountNumber)
}

export function armarDatosPdf(a: {
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow
  posiciones: PortfolioPositionRow[]
  glByCusip: Map<string, PortfolioUnrealizedGainLossRow>
  sections: PdfSections
  assetAllocation: { label: string; value: number; pct: number }[]
  fixedIncomeBreakdown: { label: string; value: number; pct: number }[]
  currencyExposure: { label: string; value: number; pct: number }[]
  liquidity: { value: number; pct: number }
  custodianBreakdown: { label: string; value: number; pct: number }[]
  cashProjRows: PortfolioCashProjectionRow[]
  projectedIncome12m: number
  performance: PortfolioPerformanceRow | null
  history: { snapshot_date: string; total_market_value: string }[]
  manualIncomeYieldPct: number | null
  dividendResults: { fundName: string; totalCollected: number; annualizedYieldPct: number | null; isEstimate: boolean }[]
  isConsolidated: boolean
  custodianByPositionId: Map<string, string> | null
}): DatosPdfPortafolio {
  const valorMercado = a.posiciones.reduce((s, p) => s + Number(p.market_value), 0)
  const cuponCorrido = a.posiciones.reduce((s, p) => s + Number(p.accrued_interest ?? 0), 0)
  const fecha = a.importRow.snapshot_date
  const nombres = new Map(a.posiciones.map((p) => [p.id, cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date).name]))

  // ── Posiciones por clase ──
  const porClase = new Map<string, FilaPdf[]>()
  let costoTotal = 0, resultadoTotal = 0, conCosto = 0
  for (const p of [...a.posiciones].sort((x, y) => Number(y.market_value) - Number(x.market_value))) {
    const gl = p.cusip ? a.glByCusip.get(p.cusip) : undefined
    const bono = p.asset_class === 'Fixed Income'
    const detalle: string[] = []
    if (bono) {
      const cupon = p.coupon != null && p.coupon !== '' ? Number(p.coupon) : null
      detalle.push(cupon != null && isFinite(cupon) ? `Cupón ${cupon.toFixed(3)}%` : 'Cupón s/d')
      detalle.push(p.maturity_date ? `Vto. ${ddmmyyyy(p.maturity_date)}` : 'Vto. s/d')
    }
    const compras = textoCompras(p.purchase_date || gl?.purchase_date)
    if (compras) detalle.push(compras)
    const costo = gl ? Number(gl.cost_basis) : null
    const resultado = gl ? Number(gl.gain_loss) : null
    if (gl) { costoTotal += costo!; resultadoTotal += resultado!; conCosto++ }
    const filas = porClase.get(p.asset_class) ?? []
    filas.push({
      nombre: nombres.get(p.id) ?? p.name,
      detalle: detalle.join(' · '),
      custodio: a.custodianByPositionId?.get(p.id) ?? null,
      cantidad: p.quantity != null && p.asset_class !== 'Cash' ? Number(p.quantity) : null,
      precio: p.price != null && p.asset_class !== 'Cash' ? Number(p.price) : null,
      valorMercado: Number(p.market_value),
      cuponCorrido: Number(p.accrued_interest ?? 0),
      peso: valorMercado ? Number(p.market_value) / valorMercado : 0,
      costo,
      resultado,
    })
    porClase.set(p.asset_class, filas)
  }
  const grupos = Array.from(porClase.entries())
    .sort(([x, fx], [y, fy]) => assetClassRank(x) - assetClassRank(y) || fy.reduce((s, f) => s + f.valorMercado, 0) - fx.reduce((s, f) => s + f.valorMercado, 0))
    .map(([clase, filas]) => ({ clase: ASSET_CLASS_ES[clase] ?? clase, filas }))

  // ── Performance ──
  let performance: DatosPdfPortafolio['performance'] = null
  const perf = a.performance
  const periodos = a.sections.performancePeriods
  const serieP = computePerfValueSeries(perf)
  const serie = serieP.length >= 2
    ? serieP.map((p) => ({ fecha: p.date, valor: p.value, label: p.label }))
    : [...a.history].sort((x, y) => x.snapshot_date.localeCompare(y.snapshot_date)).map((h) => ({ fecha: h.snapshot_date, valor: Number(h.total_market_value) }))
  if (perf || serie.length >= 2) {
    const r = (v: string | null | undefined) => (v == null || v === '' ? null : Number(v))
    const civ = perf?.change_in_value
    const items: [string, keyof typeof periodos, number | null, number | null | undefined][] = [
      ['YTD', 'ytd', r(perf?.return_ytd), civ?.ytd],
      ['1 año', 'oneYear', r(perf?.return_1y), civ?.oneYear],
      ['3 años', 'threeYear', r(perf?.return_3y), civ?.threeYear],
      ['5 años', 'fiveYear', r(perf?.return_5y), civ?.fiveYear],
      ['Desde inicio', 'sinceInception', r(perf?.return_since_inception), civ?.sinceInception],
    ]
    const activos = items.filter(([, k]) => periodos[k])
    performance = {
      rentabilidades: activos.map(([label, , valor]) => ({ label, valor })),
      cambios: activos.filter(([, , , c]) => c != null).map(([label, , , c]) => ({ label, valor: c as number })),
      valorInicial: computeInitialAccountValue(perf),
      fechaInicio: perf?.inception_date ?? null,
      serie,
      serieDePerformance: serieP.length >= 2,
    }
  }

  // ── Renta 12 meses ──
  const desde = fecha
  const hasta = `${sumarMeses(fecha, 12)}-01`
  const nombrePorCusip = new Map(a.posiciones.filter((p) => p.cusip).map((p) => [p.cusip!, nombres.get(p.id)!]))
  const flujos = a.cashProjRows
    .filter((f) => f.pay_date > desde && f.pay_date < hasta && f.estimated_amount != null)
    .sort((x, y) => x.pay_date.localeCompare(y.pay_date))
    .map((f) => ({
      fecha: f.pay_date,
      nombre: (f.cusip && nombrePorCusip.get(f.cusip)) || cleanDisplayName(f.description, null, null, null, null).name,
      tipo: TIPO_FLUJO(f.distribution_type),
      monto: Number(f.estimated_amount),
    }))
  const meses = Array.from({ length: 12 }, (_, i) => sumarMeses(fecha, i))
  const renta = a.cashProjRows.length
    ? {
        total: a.projectedIncome12m,
        meses: meses.map((m) => ({ label: monthLabel(`${m}-01`).replace(/ 20(\d\d)$/, ' $1'), monto: flujos.filter((f) => f.fecha.startsWith(m)).reduce((s, f) => s + f.monto, 0) })),
        flujos,
      }
    : null

  const custodios = a.isConsolidated
    ? ['Pershing', 'Morgan Stanley']
    // El custodio del reporte que se está viendo (el import lo guarda); el de la
    // ficha de la cuenta puede no estar cargado.
    : [(a.importRow as { custodian?: string | null }).custodian || a.account?.custodian || 'Pershing']

  return {
    cliente: nombreCliente(a.account, a.importRow, a.accountNumber),
    fecha,
    custodios,
    consolidado: a.isConsolidated,
    secciones: {
      performance: a.sections.performance, composicion: a.sections.composicion, holdings: a.sections.holdings,
      income: a.sections.income, dividendos: a.sections.dividendos,
    },
    totales: { valorMercado, cuponCorrido, costo: conCosto ? costoTotal : null, resultado: conCosto ? resultadoTotal : null },
    performance,
    composicion: {
      clases: a.assetAllocation.map((x) => ({ label: x.label, valor: x.value, peso: x.pct / 100 })),
      rentaFija: a.fixedIncomeBreakdown.map((x) => ({ label: x.label, valor: x.value, peso: x.pct / 100 })),
      monedas: a.currencyExposure.map((x) => ({ label: x.label, valor: x.value, peso: x.pct / 100 })),
      custodios: a.custodianBreakdown.map((x) => ({ label: x.label, valor: x.value, peso: x.pct / 100 })),
      liquidez: { valor: a.liquidity.value, peso: a.liquidity.pct / 100 },
      rendimientoIncome: a.manualIncomeYieldPct,
    },
    grupos,
    renta,
    dividendos: a.dividendResults.map((x) => ({ fondo: x.fundName, cobrado: x.totalCollected, tasa: x.annualizedYieldPct, estimado: x.isEstimate })),
  }
}
