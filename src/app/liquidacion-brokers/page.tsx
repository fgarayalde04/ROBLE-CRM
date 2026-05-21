import { unstable_noStore } from 'next/cache'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'
import BrokerSettlementTable from '@/components/BrokerSettlementTable'
import BrokerSettlementMetrics from '@/components/BrokerSettlementMetrics'
import AddYearButton from '@/components/AddYearButton'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerTable {
  id: string
  advisor_name: string
  company: string
  year: number
}

interface BrokerRow {
  id: string
  concept: string
  sort_order: number
  is_formula: boolean
  formula_type: string | null
  values: Record<string, { id?: string; value: number | null; raw_value: string | null }>
}

// ─── Month sorting ────────────────────────────────────────────────────────────

const MONTH_ORDER: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
}

function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0'), yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getOrCreateTable(advisor: string, company: string, year: number): Promise<BrokerTable> {
  const { data: existing } = await supabaseAdmin
    .from('broker_settlement_tables')
    .select('*')
    .eq('advisor_name', advisor)
    .eq('company', company)
    .eq('year', year)
    .single()

  if (existing) return existing as BrokerTable

  const { data: created } = await supabaseAdmin
    .from('broker_settlement_tables')
    .insert({ advisor_name: advisor, company, year })
    .select('*')
    .single()

  return (created ?? { id: '', advisor_name: advisor, company, year }) as BrokerTable
}

async function fetchRows(tableId: string): Promise<{ rows: BrokerRow[]; months: string[] }> {
  if (!tableId) return { rows: [], months: [] }

  const { data: rawRows } = await supabaseAdmin
    .from('broker_settlement_rows')
    .select('*')
    .eq('table_id', tableId)
    .order('sort_order', { ascending: true })

  if (!rawRows || rawRows.length === 0) return { rows: [], months: [] }

  const rowIds = rawRows.map((r: { id: string }) => r.id)

  const { data: rawValues } = await supabaseAdmin
    .from('broker_settlement_values')
    .select('*')
    .in('row_id', rowIds)

  const allMonths = new Set<string>()
  const valuesByRow: Record<string, Record<string, { id?: string; value: number | null; raw_value: string | null }>> = {}

  for (const v of (rawValues ?? [])) {
    if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
    valuesByRow[v.row_id][v.month] = { id: v.id, value: v.value, raw_value: v.raw_value }
    allMonths.add(v.month)
  }

  const rows: BrokerRow[] = rawRows.map((r: {
    id: string
    concept: string
    sort_order: number
    is_formula: boolean
    formula_type: string | null
  }) => ({
    id: r.id,
    concept: r.concept,
    sort_order: r.sort_order,
    is_formula: r.is_formula,
    formula_type: r.formula_type,
    values: valuesByRow[r.id] ?? {},
  }))

  return { rows, months: sortMonths(Array.from(allMonths)) }
}

// ─── Advisors config ──────────────────────────────────────────────────────────

const ADVISORS: { name: string; label: string; companies: string[] }[] = [
  { name: 'FRAN JJ',           label: 'Fran JJ',           companies: ['roble'] },
  { name: 'Sandra',            label: 'Sandra',            companies: ['geliene', 'roble'] },
  { name: 'Javier',            label: 'Javier',            companies: ['geliene', 'roble'] },
  { name: 'Inés',              label: 'Inés',              companies: ['roble'] },
  { name: 'Guillermo',         label: 'Guillermo',         companies: ['geliene', 'roble'] },
  { name: 'Francisco',         label: 'Francisco',         companies: ['roble'] },
  { name: 'Federico-Fernando', label: 'Federico-Fernando', companies: ['roble'] },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: { tab?: string; advisor?: string; company?: string; year?: string }
}

export default async function LiquidacionBrokersPage({ searchParams }: PageProps) {
  unstable_noStore()

  const tab     = searchParams.tab ?? 'tabla'
  const advisor = searchParams.advisor ?? ADVISORS[0].name

  // Find advisor config to get the right company
  const advisorConfig = ADVISORS.find((a) => a.name === advisor) ?? ADVISORS[0]
  const company = (searchParams.company && advisorConfig.companies.includes(searchParams.company))
    ? searchParams.company
    : advisorConfig.companies[0]

  // Fetch all existing years for this advisor+company
  const { data: existingTables } = await supabaseAdmin
    .from('broker_settlement_tables')
    .select('id, year')
    .eq('advisor_name', advisor)
    .eq('company', company)
    .order('year', { ascending: false })

  const availableYears: number[] = (existingTables ?? []).map((t: { id: string; year: number }) => t.year)
  const mostRecentYear = availableYears.length > 0 ? availableYears[0] : null

  // Smart default: use searchParams.year if it exists in DB, else fall back to most recent, else current calendar year
  const currentCalendarYear = new Date().getFullYear()
  const requestedYear = searchParams.year ? parseInt(searchParams.year) : null
  const year = (requestedYear && availableYears.includes(requestedYear))
    ? requestedYear
    : (mostRecentYear ?? currentCalendarYear)

  // Only call getOrCreateTable for years that actually exist
  const tableExists = availableYears.includes(year)
  const table            = tableExists ? await getOrCreateTable(advisor, company, year) : { id: '', advisor_name: advisor, company, year }
  const { rows, months } = tableExists ? await fetchRows(table.id) : { rows: [], months: [] }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#2D3F52]">Liquidacion Brokers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de liquidaciones por asesor</p>
        </div>

        {/* Advisor tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {ADVISORS.map((a) => {
            const isActive = a.name === advisor
            return (
              <Link
                key={a.name}
                href={`?advisor=${encodeURIComponent(a.name)}&company=${encodeURIComponent(a.companies[0])}&year=${year}&tab=${tab}`}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#2D3F52] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {a.label}
              </Link>
            )
          })}
        </div>

        {/* Company sub-tabs (only when advisor has multiple companies) */}
        {advisorConfig.companies.length > 1 && (
          <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 border border-gray-200 w-fit">
            {advisorConfig.companies.map((co) => (
              <Link
                key={co}
                href={`?advisor=${encodeURIComponent(advisor)}&company=${encodeURIComponent(co)}&year=${year}&tab=${tab}`}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                  company === co
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {co.charAt(0).toUpperCase() + co.slice(1)}
              </Link>
            ))}
          </div>
        )}

        {/* Year selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {availableYears.map((y) => (
            <Link
              key={y}
              href={`?advisor=${encodeURIComponent(advisor)}&company=${encodeURIComponent(company)}&year=${y}&tab=${tab}`}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                y === year
                  ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#2D3F52]'
              }`}
            >
              {y}
            </Link>
          ))}
          <AddYearButton
            advisor={advisor}
            company={company}
            tab={tab}
            mostRecentYear={mostRecentYear}
          />
        </div>

        {/* View tabs (Tabla / Metricas) */}
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200 w-fit">
          <Link
            href={`?tab=tabla&advisor=${encodeURIComponent(advisor)}&company=${encodeURIComponent(company)}&year=${year}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'tabla'
                ? 'bg-[#2D3F52] text-white'
                : 'text-gray-600 hover:text-[#2D3F52] hover:bg-gray-50'
            }`}
          >
            Tabla
          </Link>
          <Link
            href={`?tab=metricas&advisor=${encodeURIComponent(advisor)}&company=${encodeURIComponent(company)}&year=${year}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'metricas'
                ? 'bg-[#2D3F52] text-white'
                : 'text-gray-600 hover:text-[#2D3F52] hover:bg-gray-50'
            }`}
          >
            Metricas
          </Link>
        </div>

        {/* Content */}
        {tab === 'tabla' ? (
          <BrokerSettlementTable
            key={`${advisor}-${company}-${year}-tabla`}
            table={table}
            rows={rows}
            months={months}
          />
        ) : (
          <BrokerSettlementMetrics
            key={`${advisor}-${company}-${year}-metricas`}
            table={table}
            rows={rows}
            months={months}
          />
        )}
      </div>
    </div>
  )
}
