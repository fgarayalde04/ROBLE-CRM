import Link from 'next/link'
import type { ClientAccount } from '@/lib/db/client360'
import type { RiesgoCliente } from '@/lib/db/clientPositions'
import { RISK_GROUPS, type EstadoPerfil } from '@/lib/riskGroups'
import RiskGauge, { RISK_BAR } from '@/components/RiskGauge'

// Cuentas del cliente, cada una con su valor, su riesgo (velocímetro), la
// composición por grupo de riesgo y el detalle de posiciones. Une las cuentas
// del maestro (monitoring_base_accounts + último snapshot de portfolio) con las
// de las posiciones cargadas.

const ESTADO: Partial<Record<EstadoPerfil, { label: string; cls: string }>> = {
  dentro:   { label: 'Dentro del perfil', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  excedido: { label: 'Excede el perfil',  cls: 'bg-red-50 text-red-700 border-red-200' },
}

const TIPO_LABEL: Record<string, string> = {
  cash: 'Cash', fondos: 'Fondo', fondo: 'Fondo', bonos: 'Bono', bono: 'Bono', acciones: 'Acción', accion: 'Acción', etf: 'ETF',
}

function money(n: number | null | undefined, cur?: string | null) {
  if (n == null || !isFinite(Number(n))) return '—'
  return `${cur || 'USD'} ${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
}

function fmtDay(v: unknown) {
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : String(v)
}

type Riesgo = RiesgoCliente['cuentas'][number]

export default function ClientAccountsCard({
  accounts,
  riesgo,
}: {
  accounts: ClientAccount[]
  riesgo: RiesgoCliente | null
}) {
  const porCuenta = new Map<string | null, Riesgo>()
  for (const c of riesgo?.cuentas ?? []) porCuenta.set(c.account_number?.toUpperCase() ?? null, c)

  const filas: { key: string; account: ClientAccount | null; r: Riesgo | null }[] = accounts.map((a) => ({
    key: a.account_number,
    account: a,
    r: porCuenta.get(a.account_number.toUpperCase()) ?? null,
  }))
  const vistas = new Set(accounts.map((a) => a.account_number.toUpperCase()))
  for (const [num, r] of Array.from(porCuenta.entries())) {
    if (num && vistas.has(num)) continue
    filas.push({ key: num ?? '__sin_cuenta', account: null, r: { ...r } })
  }
  if (filas.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Cuentas</h2>
        <span className="text-xs text-gray-400">{filas.length} {filas.length === 1 ? 'cuenta' : 'cuentas'}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {filas.map(({ key, account: a, r }) => {
          const numero = a?.account_number ?? r?.account_number ?? null
          const valor = a?.total_market_value ?? r?.montoTotal ?? null
          const estado = r ? ESTADO[r.estado] : undefined
          return (
            <div key={key} className="p-4 md:p-5">
              {/* Encabezado de la cuenta */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 font-mono">{numero ?? 'Sin cuenta asignada'}</p>
                  <p className="text-xs text-gray-400">
                    {[a?.custodian, a?.entity && a.entity !== a.custodian ? a.entity : null, a?.account_name].filter(Boolean).join(' · ') ||
                      (numero ? 'Solo posiciones cargadas' : 'Posiciones de órdenes ejecutadas sin cuenta')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 whitespace-nowrap">{money(valor, a?.base_currency)}</p>
                  <p className="text-xs text-gray-400">
                    {a?.snapshot_date ? `al ${fmtDay(a.snapshot_date)}` : r ? 'según posiciones' : 'sin datos de valor'}
                  </p>
                  {numero && a && (
                    <Link href={`/factsheet/${encodeURIComponent(numero)}`} className="text-xs text-blue-600 hover:underline">
                      Ver cartera
                    </Link>
                  )}
                </div>
              </div>

              {/* Riesgo de la cuenta */}
              {r ? (
                <div className="mt-4 flex flex-col sm:flex-row gap-4 sm:items-center">
                  <div className="flex justify-center shrink-0">
                    <RiskGauge puntaje={r.puntaje} tope={riesgo?.tope ?? null} size={170} label="Riesgo de la cuenta" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    {estado && (
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${estado.cls}`}>{estado.label}</span>
                    )}
                    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                      {r.composicion.map((c) => (
                        <div key={c.grupo} className={RISK_BAR[c.grupo]} style={{ width: `${c.pct}%` }} />
                      ))}
                    </div>
                    <ul className="space-y-1">
                      {r.composicion.map((c) => (
                        <li key={c.grupo} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${RISK_BAR[c.grupo]}`} />
                          <span className="flex-1 text-gray-600 truncate">
                            {c.grupo === 'sin_clasificar' ? 'Sin clasificar' : `${RISK_GROUPS[c.grupo].label} (${RISK_GROUPS[c.grupo].puntaje})`}
                          </span>
                          <span className="text-gray-400">{money(c.monto)}</span>
                          <span className="w-9 text-right text-gray-700 font-semibold">{c.pct.toFixed(0)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-400">Sin posiciones cargadas para calcular el riesgo de esta cuenta.</p>
              )}

              {/* Posiciones */}
              {r && r.posiciones.length > 0 && (
                <details className="mt-4 group">
                  <summary className="text-xs text-blue-600 cursor-pointer select-none hover:underline">
                    Ver {r.posiciones.length} {r.posiciones.length === 1 ? 'posición' : 'posiciones'}
                  </summary>
                  <div className="mobile-scroll-x mt-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 text-left">
                          <th className="py-1.5 pr-3 font-medium">Instrumento</th>
                          <th className="py-1.5 pr-3 font-medium">Tipo</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Cantidad</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Monto</th>
                          <th className="py-1.5 pr-3 font-medium text-right">%</th>
                          <th className="py-1.5 font-medium">Riesgo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {r.posiciones.map((p, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-3 text-gray-900">{p.nombre}</td>
                            <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{p.tipo_activo ? (TIPO_LABEL[p.tipo_activo] ?? p.tipo_activo) : '—'}</td>
                            <td className="py-1.5 pr-3 text-right text-gray-700 whitespace-nowrap">
                              {p.cantidad != null ? Number(p.cantidad).toLocaleString('es-UY', { maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-gray-900 whitespace-nowrap">{money(p.monto)}</td>
                            <td className="py-1.5 pr-3 text-right text-gray-500">
                              {p.monto != null && r.montoTotal > 0 ? `${((Number(p.monto) / r.montoTotal) * 100).toFixed(1)}%` : '—'}
                            </td>
                            <td className="py-1.5 whitespace-nowrap">
                              {p.grupo ? (
                                <span className="inline-flex items-center gap-1.5 text-gray-600">
                                  <span className={`w-2 h-2 rounded-full ${RISK_BAR[p.grupo]}`} />
                                  {RISK_GROUPS[p.grupo]?.label ?? p.grupo} · {p.puntaje}
                                </span>
                              ) : <span className="text-amber-600">Sin clasificar</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
