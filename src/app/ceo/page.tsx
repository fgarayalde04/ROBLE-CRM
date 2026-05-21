import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_noStore } from 'next/cache'
import { getCeoData } from '@/lib/supabase/queries'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchBrokerSummaries, fetchGastosSummaries } from '@/lib/ceo-data'
import type { AumRecord, ProductionRecord, RevenueRecord, UploadedFile } from '@/types/platform'
import CeoDashboardProduccion from '@/components/CeoDashboardProduccion'
import CeoDashboardClientes from '@/components/CeoDashboardClientes'
import CeoDashboardEmpresa from '@/components/CeoDashboardEmpresa'

export const metadata: Metadata = { title: 'Dashboard CEO' }
export const dynamic = 'force-dynamic'

// ─── Helpers (kept for backward compat) ──────────────────────────────────────

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toLocaleString()}`
}

function pct(current: number, prev: number) {
  if (prev === 0) return null
  return ((current - prev) / prev) * 100
}

function getMonthPeriods() {
  const now = new Date()
  const current = now.toISOString().slice(0, 7)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)
  const sameLastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 7)
  const currentYear = now.getFullYear().toString()
  const lastYear = (now.getFullYear() - 1).toString()
  return { current, prev, sameLastYear, currentYear, lastYear }
}

function sumByPeriod(records: { period: string; [key: string]: unknown }[], valueKey: string, period: string) {
  return records
    .filter((r) => r.period === period)
    .reduce((acc, r) => acc + (r[valueKey] as number), 0)
}

function sumByYear(records: { period: string; [key: string]: unknown }[], valueKey: string, year: string) {
  return records
    .filter((r) => r.period.startsWith(year))
    .reduce((acc, r) => acc + (r[valueKey] as number), 0)
}

function latestAum(records: AumRecord[]) {
  if (records.length === 0) return 0
  const latest = records.reduce((a, b) => (a.period > b.period ? a : b)).period
  return records.filter((r) => r.period === latest).reduce((s, r) => s + r.aum_value, 0)
}

// ─── Tab Link ─────────────────────────────────────────────────────────────────

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-white text-[#2D3F52] shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </Link>
  )
}

// ─── KPI Component (kept) ─────────────────────────────────────────────────────

function CeoKpi({
  label, value, sub, accent, trend, href,
}: {
  label: string; value: string; sub: string; accent: string; trend?: number | null; href?: string
}) {
  const content = (
    <div
      className="bg-white rounded-lg border border-[#E2E8F0] p-5 hover:shadow-sm transition-shadow"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {trend !== null && trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? '▲' : '▼'}
          </span>
        )}
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
    </div>
  )

  return href ? <Link href={href} className="block">{content}</Link> : <div>{content}</div>
}

// Suppress unused warning — CeoKpi is kept for backward compat
void CeoKpi
void fmt
void pct
void sumByPeriod
void sumByYear
void latestAum

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: { tab?: string }
}

export default async function CeoDashboardPage({ searchParams }: PageProps) {
  unstable_noStore()

  const tab = searchParams.tab ?? 'produccion'
  const currentYear = new Date().getFullYear()

  // Fetch existing CEO data
  let ceoData = {
    aum_records: [] as AumRecord[],
    production_records: [] as ProductionRecord[],
    revenue_records: [] as RevenueRecord[],
    active_clients: 0,
    in_apertura_clients: 0,
    new_clients_this_month: 0,
    openings_this_month: 0,
    uploaded_files: [] as UploadedFile[],
  }
  try { ceoData = await getCeoData() } catch { /* ignore */ }

  // Fetch new data
  const [brokerSummaries, gastosSummaries] = await Promise.all([
    fetchBrokerSummaries(currentYear).catch(() => []),
    fetchGastosSummaries(currentYear).catch(() => []),
  ])

  // Fetch openings by status
  let openingsByStatus: Record<string, number> = {}
  try {
    const { data: openings } = await supabaseAdmin
      .from('account_openings')
      .select('status')
    for (const o of openings ?? []) {
      const s = o.status as string
      openingsByStatus[s] = (openingsByStatus[s] ?? 0) + 1
    }
  } catch { /* ignore */ }

  // Fetch clients by advisor
  let clientsByAdvisor: { advisor: string; count: number }[] = []
  try {
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('advisor')
      .eq('status', 'activo')
      .not('advisor', 'is', null)
    const map: Record<string, number> = {}
    for (const c of clients ?? []) {
      if (c.advisor) map[c.advisor as string] = (map[c.advisor as string] ?? 0) + 1
    }
    clientsByAdvisor = Object.entries(map)
      .map(([advisor, count]) => ({ advisor, count }))
      .sort((a, b) => b.count - a.count)
  } catch { /* ignore */ }

  const { currentYear: cYear } = getMonthPeriods()
  void cYear

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: '#F4F6F8', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Roble Capital Wealth Management</p>
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Dashboard ejecutivo</h1>
        </div>
        <Link
          href="/ceo/import"
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 bg-white rounded-lg text-gray-600 hover:bg-gray-50"
        >
          Importar datos
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <TabLink href="/ceo?tab=produccion" active={tab === 'produccion'} label="Produccion" />
        <TabLink href="/ceo?tab=clientes" active={tab === 'clientes'} label="Clientes" />
        <TabLink href="/ceo?tab=empresa" active={tab === 'empresa'} label="Empresa" />
      </div>

      {/* Content */}
      {tab === 'produccion' && (
        <CeoDashboardProduccion
          brokerSummaries={brokerSummaries}
          aumRecords={ceoData.aum_records}
          productionRecords={ceoData.production_records}
          revenueRecords={ceoData.revenue_records}
          currentYear={currentYear}
        />
      )}
      {tab === 'clientes' && (
        <CeoDashboardClientes
          activeClients={ceoData.active_clients}
          inAperturaClients={ceoData.in_apertura_clients}
          newClientsThisMonth={ceoData.new_clients_this_month}
          openingsThisMonth={ceoData.openings_this_month}
          openingsByStatus={openingsByStatus}
          clientsByAdvisor={clientsByAdvisor}
        />
      )}
      {tab === 'empresa' && (
        <CeoDashboardEmpresa
          gastosSummaries={gastosSummaries}
          currentYear={currentYear}
        />
      )}
    </div>
  )
}
