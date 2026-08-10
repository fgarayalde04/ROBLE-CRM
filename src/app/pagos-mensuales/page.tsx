import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore } from 'next/cache'
import { pool } from '@/lib/db/pool'
import { getOrCreatePaymentTable, fetchPaymentTableRows } from '@/lib/db/pagosMensuales'
import PagosMensualesTable, { type PaymentRow } from '@/components/PagosMensualesTable'
import PagosMensualesDashboard from '@/components/PagosMensualesDashboard'

export const metadata: Metadata = { title: 'Pagos mensuales' }
export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentTable {
  id: string
  company: string
  year: number
  exchange_rate: number
  closed_months: string[]
}

interface RawRow {
  id: string
  concept: string
  expense_type: string
  category: string
  comment: string | null
  sort_order: number
  monthly_payment_values: {
    id: string
    month: string
    value: number | null
    raw_value: string | null
    payment_status: string | null
    paid_at: string | null
  }[]
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function getOrCreateTable(company: string, year: number): Promise<PaymentTable> {
  return (await getOrCreatePaymentTable(company, year)) as PaymentTable
}

async function fetchRows(tableId: string): Promise<PaymentRow[]> {
  return (await fetchPaymentTableRows(tableId)) as unknown as PaymentRow[]
}

async function getAllTables(): Promise<{ table: PaymentTable; rows: PaymentRow[] }[]> {
  const { rows: tables } = await pool.query(`select * from monthly_payment_tables order by year asc`)

  return Promise.all(
    (tables as PaymentTable[]).map(async (table) => {
      const rows = await fetchRows(table.id)
      return { table, rows }
    })
  )
}

async function getAvailableYears(company: string): Promise<number[]> {
  const { rows } = await pool.query(
    `select year from monthly_payment_tables where company = $1 order by year asc`,
    [company]
  )
  return rows.map((r) => r.year)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SearchParams {
  company?: string
  year?: string
  tab?: string
}

export default async function PagosMensualesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  unstable_noStore()

  const tab = searchParams.tab ?? null
  const isDashboard = tab === 'dashboard'
  const company = (searchParams.company ?? 'roble') as 'roble' | 'geliene'
  const year = parseInt(searchParams.year ?? '2026', 10)

  // Fetch data
  let tableData: PaymentTable | null = null
  let rows: PaymentRow[] = []
  let allTables: { table: PaymentTable; rows: PaymentRow[] }[] = []
  let availableYearsRoble: number[] = []
  let availableYearsGeliene: number[] = []

  if (isDashboard) {
    allTables = await getAllTables()
    availableYearsRoble = Array.from(new Set(allTables.filter((t) => t.table.company === 'roble').map((t) => t.table.year))).sort()
    availableYearsGeliene = Array.from(new Set(allTables.filter((t) => t.table.company === 'geliene').map((t) => t.table.year))).sort()
  } else {
    tableData = await getOrCreateTable(company, year)
    rows = await fetchRows(tableData.id)
    availableYearsRoble = await getAvailableYears('roble')
    availableYearsGeliene = await getAvailableYears('geliene')
  }

  const availableYears = company === 'roble' ? availableYearsRoble : availableYearsGeliene
  const allYears = Array.from(new Set([...availableYearsRoble, ...availableYearsGeliene])).sort()

  // Year options for selector: union of all available years + next year
  const maxYear = Math.max(year, ...allYears, 2026)
  const yearOptions = Array.from(new Set([...allYears, maxYear + 1])).sort()

  const companyLabel = company === 'roble' ? 'Roble' : 'Geliene'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#2D3F52]">Pagos mensuales</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Control de gastos operativos por empresa y mes
        </p>
      </div>

      {/* Tabs + Year selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <Link
            href={`/pagos-mensuales?company=roble&year=${year}`}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              !isDashboard && company === 'roble'
                ? 'bg-white text-[#2D3F52] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Roble
          </Link>
          <Link
            href={`/pagos-mensuales?company=geliene&year=${year}`}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              !isDashboard && company === 'geliene'
                ? 'bg-white text-[#2D3F52] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Geliene
          </Link>
          <Link
            href={`/pagos-mensuales?tab=dashboard&year=${year}`}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              isDashboard
                ? 'bg-white text-[#2D3F52] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Dashboard
          </Link>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Ano:</span>
          {yearOptions.map((yr) => {
            const isAvailable = allYears.includes(yr)
            const isCurrent = yr === year
            const href = isDashboard
              ? `/pagos-mensuales?tab=dashboard&year=${yr}`
              : `/pagos-mensuales?company=${company}&year=${yr}`

            return (
              <Link
                key={yr}
                href={href}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  isCurrent
                    ? 'border-[#16A34A] bg-[#16A34A] text-white font-semibold'
                    : isAvailable
                    ? 'border-gray-300 text-gray-600 hover:border-[#2D3F52]'
                    : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
                }`}
              >
                {yr}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {isDashboard ? (
        <PagosMensualesDashboard tables={allTables} currentYear={year} />
      ) : tableData ? (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-[#2D3F52]">
              {companyLabel} — {year}
            </h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {rows.length} filas
            </span>
          </div>
          <PagosMensualesTable
            key={`${company}-${year}`}
            table={tableData}
            rows={rows}
            availableYears={availableYears}
            currentYear={year}
            company={company}
            closedMonths={tableData.closed_months ?? []}
          />
        </div>
      ) : null}
    </div>
  )
}
