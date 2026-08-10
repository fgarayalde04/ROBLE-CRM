import { listBrokerTables, fetchBrokerRows } from '@/lib/db/liquidacionBrokers'
import { listPaymentTables, fetchPaymentTableRows } from '@/lib/db/pagosMensuales'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrokerSummary {
  advisor_name: string
  company: string
  year: number
  months: string[]
  facturacion: Record<string, number>
  total_liquidado: Record<string, number>
  lh2: Record<string, number>
  lh3: Record<string, number>
  fees: Record<string, number>
  retencion: Record<string, number>
}

export interface GastosSummary {
  company: 'roble' | 'geliene'
  year: number
  exchange_rate: number
  por_mes: Record<string, number>
  fijos: number
  variables: number
  por_categoria: Record<string, number>
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseVal(raw: string | null | undefined): number {
  if (!raw || raw === '?') return 0
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

const MONTH_ORDER: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
}

function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0')
    const yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })
}

// ─── Broker Summaries ─────────────────────────────────────────────────────────

export async function fetchBrokerSummaries(year: number): Promise<BrokerSummary[]> {
  const allTables = await listBrokerTables()
  const tables = allTables.filter((t: any) => t.year === year)

  if (tables.length === 0) return []

  const summaries: BrokerSummary[] = []

  for (const table of tables) {
    const tableId = table.id as string

    const { rows } = await fetchBrokerRows(tableId)
    if (!rows || rows.length === 0) continue

    const safeRows = rows as { id: string; concept: string; values: Record<string, { raw_value: string | null }> }[]

    const allMonths = new Set<string>()
    for (const r of safeRows) for (const month of Object.keys(r.values)) allMonths.add(month)
    const months = sortMonths(Array.from(allMonths))

    // Helper to get value for a given concept
    const getConceptVals = (concept: string): Record<string, number> => {
      const row = safeRows.find((r) => r.concept === concept)
      if (!row) return {}
      const vals: Record<string, number> = {}
      for (const month of months) {
        vals[month] = parseVal(row.values[month]?.raw_value)
      }
      return vals
    }

    const lh2Vals = getConceptVals('LH2')
    const lh3Vals = getConceptVals('LH3')
    const feeLH2Vals = getConceptVals('Fee LH2')
    const feeLH3Vals = getConceptVals('Fee LH3')
    const retencionVals = getConceptVals('Retencion impuesto a los dividendos 7%')
    const otrosVals = getConceptVals('otros')

    const facturacion: Record<string, number> = {}
    const total_liquidado: Record<string, number> = {}
    const fees: Record<string, number> = {}
    const retencion: Record<string, number> = {}

    for (const month of months) {
      const lh2 = lh2Vals[month] ?? 0
      const lh3 = lh3Vals[month] ?? 0
      const feeLH2 = feeLH2Vals[month] ?? 0
      const feeLH3 = feeLH3Vals[month] ?? 0
      const ret = retencionVals[month] ?? 0
      const otros = otrosVals[month] ?? 0

      const fact = lh2 + lh3
      const pct40 = fact * 0.40
      const subtotal = pct40 + feeLH2 + feeLH3
      const total = subtotal - ret + otros

      facturacion[month] = fact
      fees[month] = Math.abs(feeLH2) + Math.abs(feeLH3)
      retencion[month] = ret
      total_liquidado[month] = total
    }

    summaries.push({
      advisor_name: table.advisor_name as string,
      company: table.company as string,
      year: table.year as number,
      months,
      facturacion,
      total_liquidado,
      lh2: lh2Vals,
      lh3: lh3Vals,
      fees,
      retencion,
    })
  }

  return summaries
}

// ─── Gastos Summaries ─────────────────────────────────────────────────────────

export async function fetchGastosSummaries(year: number): Promise<GastosSummary[]> {
  const companies: ('roble' | 'geliene')[] = ['roble', 'geliene']
  const summaries: GastosSummary[] = []

  for (const company of companies) {
    const allTables = await listPaymentTables()
    const table = allTables.find((t: any) => t.company === company && t.year === year)
    if (!table) continue

    const tableId = table.id as string
    const exchangeRate = (table.exchange_rate as number) ?? 1

    const rawRows = await fetchPaymentTableRows(tableId)
    if (!rawRows || rawRows.length === 0) continue

    // Aggregate
    const por_mes: Record<string, number> = {}
    const por_categoria: Record<string, number> = {}
    let fijos = 0
    let variables = 0

    for (const row of rawRows) {
      const expenseType = row.expense_type as string
      const category = (row.category as string) ?? 'otros'
      let rowTotal = 0

      for (const [month, entry] of Object.entries(row.values)) {
        const val = parseVal((entry as any)?.raw_value ?? null)
        if (val === 0) continue
        por_mes[month] = (por_mes[month] ?? 0) + val
        rowTotal += val
      }

      if (expenseType === 'fijo') {
        fijos += rowTotal
      } else {
        variables += rowTotal
      }

      por_categoria[category] = (por_categoria[category] ?? 0) + rowTotal
    }

    const total = Object.values(por_mes).reduce((s, v) => s + v, 0)

    summaries.push({
      company,
      year,
      exchange_rate: exchangeRate,
      por_mes,
      fijos,
      variables,
      por_categoria,
      total,
    })
  }

  return summaries
}
