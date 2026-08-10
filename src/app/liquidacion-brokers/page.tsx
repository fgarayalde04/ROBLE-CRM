import { unstable_noStore } from 'next/cache'
import Link from 'next/link'
import { pool } from '@/lib/db/pool'
import { getOrCreateBrokerTable, fetchBrokerRows } from '@/lib/db/liquidacionBrokers'
import BrokerSettlementTable from '@/components/BrokerSettlementTable'
import BrokerSettlementMetrics from '@/components/BrokerSettlementMetrics'
import AddYearButton from '@/components/AddYearButton'

export const dynamic = 'force-dynamic'

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
  const { rows: existingTables } = await pool.query(
    `select id, year from broker_settlement_tables where advisor_name = $1 and company = $2 order by year desc`,
    [advisor, company]
  )

  const availableYears: number[] = existingTables.map((t) => t.year)
  const mostRecentYear = availableYears.length > 0 ? availableYears[0] : null

  // Smart default: use searchParams.year if it exists in DB, else fall back to most recent, else current calendar year
  const currentCalendarYear = new Date().getFullYear()
  const requestedYear = searchParams.year ? parseInt(searchParams.year) : null
  const year = (requestedYear && availableYears.includes(requestedYear))
    ? requestedYear
    : (mostRecentYear ?? currentCalendarYear)

  // Only call getOrCreateTable for years that actually exist
  const tableExists = availableYears.includes(year)
  const table            = tableExists ? await getOrCreateBrokerTable(advisor, company, year) : { id: '', advisor_name: advisor, company, year }
  const { rows, months } = tableExists ? await fetchBrokerRows(table.id) : { rows: [], months: [] }

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
