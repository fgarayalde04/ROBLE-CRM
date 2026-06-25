import { unstable_noStore as noStore } from 'next/cache'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import BancoCentralTable, { type BancoCentralRecord } from '@/components/BancoCentralTable'
import SyncBancoCentralButton from '@/components/SyncBancoCentralButton'
import MonitoreoPanel from '@/components/MonitoreoPanel'
import ScoringPanel from '@/components/ScoringPanel'

export const dynamic = 'force-dynamic'

function computeKpis(rows: BancoCentralRecord[]) {
  const total       = rows.length
  const cerradas    = rows.filter((r) => r.status === 'cerrada').length
  const activas     = total - cerradas
  const completos   = rows.filter((r) => r.status === 'completo').length
  const incompletos = rows.filter((r) => r.status === 'incompleto').length
  const pct         = activas > 0 ? Math.round((completos / activas) * 100) : 0
  return { total, activas, completos, incompletos, cerradas, pct }
}

export default async function BancoCentralPage({
  searchParams,
}: {
  searchParams: { section?: string; tab?: string; mon?: string }
}) {
  noStore()

  const session = await getSession()
  const folderFilter = session?.allowed_folders ?? null

  // Top-level section: 'legajos' | 'monitoreo' | 'scoring'
  const section = searchParams.section === 'monitoreo'
    ? 'monitoreo'
    : searchParams.section === 'scoring'
      ? 'scoring'
      : 'legajos'

  // Legajos sub-tab: 'local' | 'internacional'
  const legajosTab = searchParams.tab === 'internacional' ? 'internacional' : 'local'

  // Monitoreo sub-tab: 'roble' | 'geliene'
  const monTab = (searchParams.mon === 'geliene' ? 'geliene' : 'roble') as 'roble' | 'geliene'

  // If folder-scoped, get client_numbers belonging to those advisor folders
  let allowedCustomerNumbers: string[] | null = null
  if (folderFilter) {
    const { data: advisorClients } = await supabaseAdmin
      .from('clients')
      .select('client_number')
      .in('advisor', folderFilter)
      .not('client_number', 'is', null)
    allowedCustomerNumbers = (advisorClients ?? []).map((c: any) => c.client_number).filter(Boolean)
  }

  let bcuQuery = supabaseAdmin
    .from('banco_central_records')
    .select('*')
    .order('customer_number', { ascending: true, nullsFirst: false })
    .order('folder_name', { ascending: true })

  if (allowedCustomerNumbers !== null) {
    if (allowedCustomerNumbers.length === 0) {
      bcuQuery = bcuQuery.eq('id', 'no-match-empty')
    } else {
      bcuQuery = bcuQuery.in('customer_number', allowedCustomerNumbers)
    }
  }

  const { data: allRecords } = await bcuQuery
  const records   = (allRecords ?? []) as BancoCentralRecord[]
  const localRecs = records.filter((r) => r.type === 'local')
  const intlRecs  = records.filter((r) => r.type === 'internacional')
  const totalKpis = computeKpis(records)
  const activeKpis = legajosTab === 'local' ? computeKpis(localRecs) : computeKpis(intlRecs)
  const activeRecs = legajosTab === 'local' ? localRecs : intlRecs

  return (
    <div className="p-4 md:p-8" style={{ backgroundColor: '#F4F6F8', minHeight: '100vh' }}>
      {/* ── Header — desktop only ── */}
      <div className="hidden md:flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#2D3F52' }}>Banco Central</h1>
          <p className="mt-1 text-sm text-gray-500">Control documental · Monitoreo trimestral</p>
        </div>
        {section === 'legajos' && <SyncBancoCentralButton />}
      </div>
      {/* Mobile: sync button */}
      {section === 'legajos' && <div className="md:hidden flex justify-end mb-3"><SyncBancoCentralButton /></div>}

      {/* ── Top-level tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {[
          { key: 'legajos',   label: 'Legajos clientes',     icon: '📁', href: '/banco-central?section=legajos' },
          { key: 'monitoreo', label: 'Monitoreo trimestral', icon: '📊', href: '/banco-central?section=monitoreo' },
          { key: 'scoring',   label: 'Scoring de cartera',   icon: '📈', href: '/banco-central?section=scoring' },
          { key: 'ficha',     label: 'Ficha BCU',            icon: '📝', href: '/banco-central/ficha' },
        ].map(({ key, label, icon, href }) => (
          <Link
            key={key}
            href={href}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              section === key
                ? 'border-[#16A34A] text-[#2D3F52]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
      </div>

      {/* ══════════════════ LEGAJOS ══════════════════ */}
      {section === 'legajos' && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {[
              { key: 'local',         label: 'Local — Cundry',         count: localRecs.length },
              { key: 'internacional', label: 'Internacional — Geliene', count: intlRecs.length },
            ].map(({ key, label, count }) => (
              <Link
                key={key}
                href={`/banco-central?section=legajos&tab=${key}`}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  legajosTab === key
                    ? 'border-[#16A34A] text-[#2D3F52]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                <span className="ml-2 text-xs font-normal text-gray-400">({count})</span>
              </Link>
            ))}
          </div>

          {records.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
              <p className="text-gray-500 mb-2 text-sm">No hay legajos todavía.</p>
              <p className="text-gray-400 text-xs">Presioná "Sincronizar carpetas" para importar los legajos.</p>
            </div>
          ) : (
            <>
              {/* Total general */}
              <div className="mb-6">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Total general</p>
                <div className="grid grid-cols-5 gap-3">
                  <KpiCard label="Total legajos" value={totalKpis.total} />
                  <KpiCard label="Completos"     value={totalKpis.completos}   accent="green" />
                  <KpiCard label="Incompletos"   value={totalKpis.incompletos} accent="amber" />
                  <KpiCard label="Cerradas"      value={totalKpis.cerradas}    accent="red" />
                  <KpiCard
                    label="Cumplimiento"
                    value={`${totalKpis.pct}%`}
                    accent={totalKpis.pct >= 80 ? 'green' : totalKpis.pct >= 50 ? 'amber' : 'red'}
                  />
                </div>
              </div>

              {/* Stats pestaña activa */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl px-5 py-4 mb-6">
                <div className="grid grid-cols-5 gap-3">
                  <KpiCard label="Total"        value={activeKpis.total} small />
                  <KpiCard label="Completos"    value={activeKpis.completos}   accent="green" small />
                  <KpiCard label="Incompletos"  value={activeKpis.incompletos} accent="amber" small />
                  <KpiCard label="Cerradas"     value={activeKpis.cerradas}    accent="red"   small />
                  <KpiCard
                    label="Cumplimiento"
                    value={`${activeKpis.pct}%`}
                    accent={activeKpis.pct >= 80 ? 'green' : activeKpis.pct >= 50 ? 'amber' : 'red'}
                    small
                  />
                </div>
              </div>

              <BancoCentralTable key={legajosTab} initialRecords={activeRecs} />
            </>
          )}
        </>
      )}

      {/* ══════════════════ MONITOREO ══════════════════ */}
      {section === 'monitoreo' && session && (
        <>
          {/* Sub-tabs Roble / Geliene */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {[
              { key: 'roble',   label: 'Roble Capital' },
              { key: 'geliene', label: 'Geliene' },
            ].map(({ key, label }) => (
              <Link
                key={key}
                href={`/banco-central?section=monitoreo&mon=${key}`}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  monTab === key
                    ? 'border-[#16A34A] text-[#2D3F52]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <MonitoreoPanel key={monTab} user={session} entity={monTab} />
        </>
      )}

      {/* ══════════════════ SCORING DE CARTERA ══════════════════ */}
      {section === 'scoring' && session && (
        <ScoringPanel isAdmin={session.role === 'admin'} />
      )}
    </div>
  )
}

function KpiCard({
  label, value, accent, small = false,
}: {
  label: string
  value: string | number
  accent?: 'green' | 'amber' | 'red'
  small?: boolean
}) {
  const color =
    accent === 'green' ? 'text-emerald-600'
    : accent === 'amber' ? 'text-amber-600'
    : accent === 'red'   ? 'text-red-500'
    : 'text-[#2D3F52]'
  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-lg ${small ? 'px-3 py-2' : 'px-4 py-4'}`}>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${color} ${small ? 'text-xl' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}
