'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  activeClients: number
  inAperturaClients: number
  newClientsThisMonth: number
  openingsThisMonth: number
  openingsByStatus: Record<string, number>
  clientsByAdvisor: { advisor: string; count: number }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  carpeta_creada: 'Carpeta creada',
  recolectando_informacion: 'Recolectando info',
  documentacion_incompleta: 'Doc. incompleta',
  documentacion_completa: 'Doc. completa',
  formularios_enviados: 'Form. enviados',
  enviado_al_banco: 'Enviado al banco',
  en_revision_banco: 'En revision banco',
  cuenta_abierta: 'Cuenta abierta',
  trabado: 'Trabado',
  descartado: 'Descartado',
}

const PIE_COLORS = ['#2D3F52', '#16A34A', '#1D4ED8', '#7C3AED', '#059669', '#DC2626']

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const content = (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 hover:shadow-sm transition-shadow" style={{ borderTop: '3px solid #16A34A' }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[#2D3F52]">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  )
  if (href) {
    return <a href={href} className="block">{content}</a>
  }
  return <div>{content}</div>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CeoDashboardClientes({
  activeClients,
  inAperturaClients,
  newClientsThisMonth,
  openingsThisMonth,
  openingsByStatus,
  clientsByAdvisor,
}: Props) {
  const totalOpenings = Object.values(openingsByStatus).reduce((a, b) => a + b, 0)

  // Chart data: aperturas por estado
  const statusChartData = Object.entries(openingsByStatus)
    .map(([status, count]) => ({
      status: STATUS_LABELS[status] ?? status,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // Pie data: clientes por asesor
  const pieData = clientsByAdvisor.map((d) => ({ name: d.advisor, value: d.count }))

  // Insights
  const insights: string[] = []
  insights.push(`Total de clientes activos: ${activeClients}.`)
  if (inAperturaClients > 0) insights.push(`Hay ${inAperturaClients} aperturas en proceso.`)
  if (clientsByAdvisor.length > 0) {
    const top = clientsByAdvisor[0]
    insights.push(`El asesor con mas clientes es ${top.advisor} con ${top.count} clientes.`)
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Clientes activos" value={String(activeClients)} sub="estado activo" href="/clients?status=activo" />
        <Kpi label="Nuevos este mes" value={String(newClientsThisMonth)} sub="este mes" href="/clients" />
        <Kpi label="Aperturas en proceso" value={String(inAperturaClients)} sub="procesos activos" href="/openings" />
        <Kpi label="Cuentas abiertas" value={String(openingsThisMonth)} sub="este mes" href="/openings" />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Insights</p>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <p key={i} className="text-sm text-gray-700 pl-3 border-l-2 border-[#2D3F52]">{insight}</p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Clientes por asesor - Pie */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-sm font-semibold text-[#2D3F52] mb-4">Clientes por asesor</p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Aperturas por estado - Bar */}
        {statusChartData.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-sm font-semibold text-[#2D3F52] mb-4">Aperturas por estado</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusChartData} layout="vertical" margin={{ top: 0, right: 24, left: 110, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 11, fill: '#6B7280' }} width={110} />
                <Tooltip />
                <Bar dataKey="count" name="Aperturas" fill="#2D3F52" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Aperturas por estado - tabla */}
      {Object.keys(openingsByStatus).length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEF0F4]">
            <h3 className="text-sm font-semibold text-[#2D3F52]">Aperturas por estado</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(openingsByStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const pct = totalOpenings > 0 ? (count / totalOpenings) * 100 : 0
                return (
                  <div key={status} className="px-5 py-3 flex items-center gap-4">
                    <span className="text-sm text-gray-700 w-44 shrink-0">
                      {STATUS_LABELS[status] ?? status}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: '#2D3F52' }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-[#2D3F52] w-8 text-right shrink-0">{count}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
