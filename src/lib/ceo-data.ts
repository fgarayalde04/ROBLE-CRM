import { supabaseAdmin } from '@/lib/supabase/admin'

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
  const { data: tables } = await supabaseAdmin
    .from('broker_settlement_tables')
    .select('*')
    .eq('year', year)

  if (!tables || tables.length === 0) return []

  const summaries: BrokerSummary[] = []

  for (const table of tables) {
    const tableId = table.id as string

    const { data: rawRows } = await supabaseAdmin
      .from('broker_settlement_rows')
      .select('*')
      .eq('table_id', tableId)
      .order('sort_order', { ascending: true })

    if (!rawRows || rawRows.length === 0) continue

    const safeRows = rawRows as { id: string; concept: string }[]
    const rowIds = safeRows.map((r) => r.id)

    const { data: rawValues } = await supabaseAdmin
      .from('broker_settlement_values')
      .select('*')
      .in('row_id', rowIds)

    const allMonths = new Set<string>()
    // Map: row_id → month → raw_value
    const valuesByRow: Record<string, Record<string, string | null>> = {}

    for (const v of rawValues ?? []) {
      if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
      valuesByRow[v.row_id][v.month] = v.raw_value
      allMonths.add(v.month)
    }

    const months = sortMonths(Array.from(allMonths))

    // Helper to get value for a given concept
    const getConceptVals = (concept: string): Record<string, number> => {
      const row = safeRows.find((r) => r.concept === concept)
      if (!row) return {}
      const vals: Record<string, number> = {}
      for (const month of months) {
        vals[month] = parseVal(valuesByRow[row.id]?.[month])
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
    const { data: tables } = await supabaseAdmin
      .from('monthly_payment_tables')
      .select('*')
      .eq('company', company)
      .eq('year', year)
      .limit(1)

    const table = tables?.[0]
    if (!table) continue

    const tableId = table.id as string
    const exchangeRate = (table.exchange_rate as number) ?? 1

    const { data: rawRows } = await supabaseAdmin
      .from('monthly_payment_rows')
      .select('*')
      .eq('table_id', tableId)

    if (!rawRows || rawRows.length === 0) continue

    const rowIds = rawRows.map((r: { id: string }) => r.id)

    const { data: rawValues } = await supabaseAdmin
      .from('monthly_payment_values')
      .select('*')
      .in('row_id', rowIds)

    // Aggregate
    const por_mes: Record<string, number> = {}
    const por_categoria: Record<string, number> = {}
    let fijos = 0
    let variables = 0

    const valuesByRow: Record<string, Record<string, string | null>> = {}
    for (const v of rawValues ?? []) {
      if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
      valuesByRow[v.row_id][v.month] = v.raw_value
    }

    for (const row of rawRows) {
      const expenseType = row.expense_type as string
      const category = (row.category as string) ?? 'otros'
      const rowVals = valuesByRow[row.id] ?? {}
      let rowTotal = 0

      for (const [month, rawVal] of Object.entries(rowVals)) {
        const val = parseVal(rawVal as string | null)
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
