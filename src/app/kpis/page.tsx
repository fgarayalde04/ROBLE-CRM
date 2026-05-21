import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import type { OpeningStatus } from '@/types/platform'

export const metadata: Metadata = { title: 'KPIs Operativos' }
export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  if (den === 0) return 0
  return Math.round((num / den) * 100)
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string | number
  sub?: string
  color?: 'emerald' | 'amber' | 'red' | 'navy'
}) {
  const colorMap = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    navy: 'text-[#2D3F52]',
  }
  const cls = color ? colorMap[color] : 'text-[#2D3F52]'
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${cls}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-[#2D3F52] uppercase tracking-wider mb-3 border-b border-gray-200 pb-1">
      {children}
    </h2>
  )
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${color ?? 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

function ProgressBar({
  value,
  color,
}: {
  value: number
  color: string
}) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ADVISORS = ['Francisco', 'Guillermo', 'Sandra', 'Javier', 'Ines', 'Fernando - Federico']

const ACTIVE_OPENING_STATUSES: OpeningStatus[] = [
  'carpeta_creada',
  'recolectando_informacion',
  'documentacion_incompleta',
  'documentacion_completa',
  'formularios_enviados',
  'enviado_al_banco',
  'en_revision_banco',
]

const BANK_STATUSES: OpeningStatus[] = ['enviado_al_banco', 'en_revision_banco']

export default async function KpisPage() {
  noStore()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  const [
    { data: tasksRaw },
    { data: openingsRaw },
    { data: clientsRaw },
    { data: bcuRaw },
  ] = await Promise.all([
    supabaseAdmin.from('tasks').select('*'),
    supabaseAdmin.from('account_openings').select('*'),
    supabaseAdmin
      .from('clients')
      .select('id, created_at, status, advisor'),
    supabaseAdmin
      .from('banco_central_records')
      .select('status, fa'),
  ])

  const tasks = tasksRaw ?? []
  const openings = openingsRaw ?? []
  const clients = clientsRaw ?? []
  const bcuRecords = bcuRaw ?? []

  // ── Section 1: Tareas ──────────────────────────────────────────────────────
  const openTasks = tasks.filter((t) => t.status !== 'completado')
  const completedTasks = tasks.filter((t) => t.status === 'completado')
  const overdueTasks = openTasks.filter(
    (t) => t.due_date && t.due_date < todayStr
  )
  const urgentTasks = openTasks.filter((t) => t.priority === 'urgente')
  const noResponsibleTasks = openTasks.filter((t) => !t.responsible)
  const completionRate = pct(completedTasks.length, tasks.length)

  // ── Section 2: Aperturas ───────────────────────────────────────────────────
  const activeOpenings = openings.filter((o) =>
    ACTIVE_OPENING_STATUSES.includes(o.status as OpeningStatus)
  )
  const stalledOpenings = openings.filter((o) => o.status === 'trabado')
  const sentToBankOpenings = openings.filter((o) =>
    BANK_STATUSES.includes(o.status as OpeningStatus)
  )
  const openedAccounts = openings.filter((o) => o.status === 'cuenta_abierta')

  // Avg days to open (created_at → account_opened_at)
  const openedWithDates = openedAccounts.filter(
    (o) => o.created_at && o.account_opened_at
  )
  const avgDaysToOpen =
    openedWithDates.length > 0
      ? Math.round(
          openedWithDates.reduce((sum, o) => {
            const start = new Date(o.created_at).getTime()
            const end = new Date(o.account_opened_at).getTime()
            return sum + (end - start) / 86400000
          }, 0) / openedWithDates.length
        )
      : null

  // ── Section 3: Clientes ────────────────────────────────────────────────────
  const activeClients = clients.filter((c) => c.status === 'activo')
  const newClients30d = clients.filter((c) => c.created_at >= thirtyDaysAgoStr)

  // Clients per advisor
  const clientsByAdvisor: Record<string, number> = {}
  for (const c of clients) {
    const advisor = c.advisor ?? 'Sin asesor'
    clientsByAdvisor[advisor] = (clientsByAdvisor[advisor] ?? 0) + 1
  }
  const maxAdvisorCount = Math.max(1, ...Object.values(clientsByAdvisor))

  // ── Section 4: BCU ─────────────────────────────────────────────────────────
  const bcuTotal = bcuRecords.length
  const bcuCompleto = bcuRecords.filter((r) => r.status === 'completo').length
  const bcuIncompleto = bcuRecords.filter((r) => r.status === 'incompleto').length
  const bcuCerrada = bcuRecords.filter((r) => r.status === 'cerrada').length
  const bcuActive = bcuTotal - bcuCerrada
  const bcuPct = pct(bcuCompleto, bcuActive)

  // BCU by FA
  const faSet = Array.from(new Set(bcuRecords.map((r) => r.fa).filter(Boolean))) as string[]
  const bcuByFa = faSet.map((fa) => {
    const rows = bcuRecords.filter((r) => r.fa === fa)
    const completo = rows.filter((r) => r.status === 'completo').length
    const incompleto = rows.filter((r) => r.status === 'incompleto').length
    const cerrada = rows.filter((r) => r.status === 'cerrada').length
    const active = rows.length - cerrada
    return { fa, total: rows.length, completo, incompleto, cerrada, pct: pct(completo, active) }
  })

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#2D3F52]">KPIs Operativos</h1>
        <p className="mt-0.5 text-sm text-gray-500">Métricas internas del equipo</p>
      </div>

      {/* Top 4 big KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Tareas abiertas"
          value={openTasks.length}
          sub={`${overdueTasks.length} vencidas`}
          color={overdueTasks.length > 0 ? 'red' : 'navy'}
        />
        <MetricCard
          label="Tareas vencidas"
          value={overdueTasks.length}
          sub={overdueTasks.length > 0 ? 'requieren atención' : 'todo al día'}
          color={overdueTasks.length > 0 ? 'red' : 'emerald'}
        />
        <MetricCard
          label="Aperturas activas"
          value={activeOpenings.length}
          sub={`${stalledOpenings.length} trabadas`}
          color={stalledOpenings.length > 0 ? 'amber' : 'navy'}
        />
        <MetricCard
          label="Cumplimiento BCU"
          value={`${bcuPct}%`}
          sub={`${bcuCompleto}/${bcuActive} completos`}
          color={bcuPct >= 80 ? 'emerald' : bcuPct >= 50 ? 'amber' : 'red'}
        />
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Column 1: Tareas + Aperturas */}
        <div className="space-y-5">
          {/* Tareas */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionTitle>Tareas</SectionTitle>
            <StatRow label="Total abiertas" value={openTasks.length} />
            <StatRow
              label="Vencidas"
              value={overdueTasks.length}
              color={overdueTasks.length > 0 ? 'text-red-600' : undefined}
            />
            <StatRow
              label="Urgentes"
              value={urgentTasks.length}
              color={urgentTasks.length > 0 ? 'text-amber-600' : undefined}
            />
            <StatRow
              label="Sin responsable"
              value={noResponsibleTasks.length}
              color={noResponsibleTasks.length > 0 ? 'text-amber-600' : undefined}
            />
            <StatRow label="Completadas" value={completedTasks.length} />
            <StatRow
              label="Tasa de completitud"
              value={`${completionRate}%`}
              color={
                completionRate >= 70
                  ? 'text-emerald-600'
                  : completionRate >= 40
                  ? 'text-amber-600'
                  : 'text-red-600'
              }
            />
            <div className="mt-3">
              <ProgressBar
                value={completionRate}
                color={
                  completionRate >= 70
                    ? 'bg-emerald-500'
                    : completionRate >= 40
                    ? 'bg-amber-400'
                    : 'bg-red-400'
                }
              />
            </div>
          </div>

          {/* Aperturas */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <SectionTitle>Aperturas</SectionTitle>
            <StatRow label="Activas" value={activeOpenings.length} />
            <StatRow
              label="Trabadas"
              value={stalledOpenings.length}
              color={stalledOpenings.length > 0 ? 'text-red-600' : undefined}
            />
            <StatRow label="Enviadas al banco" value={sentToBankOpenings.length} />
            <StatRow
              label="Cuentas abiertas"
              value={openedAccounts.length}
              color={openedAccounts.length > 0 ? 'text-emerald-600' : undefined}
            />
            <StatRow
              label="Tiempo promedio"
              value={avgDaysToOpen !== null ? `${avgDaysToOpen}d` : '—'}
            />
          </div>
        </div>

        {/* Column 2: Clientes */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <SectionTitle>Clientes</SectionTitle>
          <StatRow label="Total activos" value={activeClients.length} />
          <StatRow
            label="Nuevos (30 días)"
            value={newClients30d.length}
            color={newClients30d.length > 0 ? 'text-emerald-600' : undefined}
          />
          <StatRow label="Total registrados" value={clients.length} />

          <div className="mt-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
              Por asesor
            </p>
            <div className="space-y-3">
              {ADVISORS.map((advisor) => {
                const count = clientsByAdvisor[advisor] ?? 0
                const width = pct(count, maxAdvisorCount)
                return (
                  <div key={advisor}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{advisor}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                    <ProgressBar
                      value={width}
                      color={count > 0 ? 'bg-[#16A34A]' : 'bg-gray-200'}
                    />
                  </div>
                )
              })}
              {Object.entries(clientsByAdvisor)
                .filter(([a]) => !ADVISORS.includes(a))
                .map(([advisor, count]) => {
                  const width = pct(count, maxAdvisorCount)
                  return (
                    <div key={advisor}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500 italic">{advisor}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                      <ProgressBar value={width} color="bg-gray-300" />
                    </div>
                  )
                })}
            </div>
          </div>
        </div>

        {/* Column 3: BCU Compliance */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <SectionTitle>BCU Compliance</SectionTitle>
          <StatRow label="Total legajos" value={bcuTotal} />
          <StatRow
            label="Completos"
            value={bcuCompleto}
            color="text-emerald-600"
          />
          <StatRow
            label="Incompletos"
            value={bcuIncompleto}
            color={bcuIncompleto > 0 ? 'text-red-600' : undefined}
          />
          <StatRow label="Cerradas" value={bcuCerrada} />

          <div className="mt-3 mb-5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Cumplimiento general</span>
              <span
                className={`font-semibold ${
                  bcuPct >= 80
                    ? 'text-emerald-600'
                    : bcuPct >= 50
                    ? 'text-amber-600'
                    : 'text-red-600'
                }`}
              >
                {bcuPct}%
              </span>
            </div>
            <ProgressBar
              value={bcuPct}
              color={
                bcuPct >= 80
                  ? 'bg-emerald-500'
                  : bcuPct >= 50
                  ? 'bg-amber-400'
                  : 'bg-red-400'
              }
            />
          </div>

          {bcuByFa.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                Por FA
              </p>
              <div className="space-y-3">
                {bcuByFa.map(({ fa, completo, incompleto, pct: faPct }) => (
                  <div key={fa}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[160px]" title={fa}>
                        {fa}
                      </span>
                      <span className="text-gray-500 text-[10px] ml-2 flex-shrink-0">
                        {completo}✓ {incompleto > 0 ? `${incompleto}✗` : ''}
                        <span
                          className={`ml-1 font-semibold ${
                            faPct >= 80
                              ? 'text-emerald-600'
                              : faPct >= 50
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {faPct}%
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={faPct}
                      color={
                        faPct >= 80
                          ? 'bg-emerald-500'
                          : faPct >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {bcuByFa.length === 0 && bcuTotal === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              Sin legajos registrados
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
