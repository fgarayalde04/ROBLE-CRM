import type { RiesgoCliente } from '@/lib/db/clientPositions'
import RiskGauge, { RISK_BAR as BAR } from '@/components/RiskGauge'
import { PERFIL_CLIENTE, RISK_GROUPS, perfilFromPuntaje, type EstadoPerfil } from '@/lib/riskGroups'

// Perfil de riesgo del cliente: el perfil asignado y el riesgo real de su
// cartera (promedio ponderado del puntaje de sus posiciones, que se ajusta
// solo con cada orden ejecutada), y si está dentro del perfil.

const ESTADO: Record<EstadoPerfil, { label: string; cls: string; detalle: string }> = {
  dentro:         { label: 'Dentro del perfil', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', detalle: '' },
  excedido:       { label: 'Excede el perfil',  cls: 'bg-red-50 text-red-700 border-red-200', detalle: 'La cartera tiene más riesgo que el tope del perfil asignado.' },
  sin_perfil:     { label: 'Sin perfil asignado', cls: 'bg-amber-50 text-amber-700 border-amber-200', detalle: 'Asigná el perfil en la ficha del cliente (Editar) para poder compararlo.' },
  sin_posiciones: { label: 'Sin posiciones',    cls: 'bg-gray-50 text-gray-500 border-gray-200', detalle: 'Todavía no hay posiciones cargadas para este cliente.' },
}

const usd = (n: number) => n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// r = null cuando el cliente no tiene número o las tablas no están migradas.
export default function ClientRiskCard({ riesgo: r }: { riesgo: RiesgoCliente | null }) {
  if (!r) return null
  const estado = ESTADO[r.estado]
  const fechaAct = [r.ultimaCarga, r.ultimoMovimiento].filter(Boolean).sort().pop()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Perfil de riesgo</h2>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${estado.cls}`}>{estado.label}</span>
      </div>

      <div className="flex justify-center">
        <RiskGauge
          puntaje={r.puntaje}
          tope={r.tope}
          label={r.puntaje != null ? `Riesgo de la cartera · ${PERFIL_CLIENTE[perfilFromPuntaje(r.puntaje)].label}` : 'Sin riesgo calculado'}
        />
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Perfil asignado</p>
        {r.perfilAsignado ? (
          <p className="text-sm text-right">
            <span className="font-semibold text-gray-900">{PERFIL_CLIENTE[r.perfilAsignado].label}</span>
            <span className="text-[11px] text-gray-500"> · hasta {r.tope}{r.perfilFuente === 'banco_central' ? ' (BCU)' : ''}</span>
          </p>
        ) : <p className="text-sm text-gray-400">—</p>}
      </div>
      {r.tope != null && r.puntaje != null && (
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">La marca negra del semicírculo es el tope del perfil.</p>
      )}

      {estado.detalle && <p className="text-[11px] text-gray-500 mt-3">{estado.detalle}</p>}
      {(() => {
        const sinClasif = r.composicion.find(c => c.grupo === 'sin_clasificar')?.pct ?? 0
        return sinClasif >= 20 ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-3">
            El {sinClasif.toFixed(0)}% de la cartera no tiene riesgo asignado: el promedio puede no ser representativo. Clasificalos en Órdenes → Instrumentos.
          </p>
        ) : null
      })()}

      {r.composicion.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
            {r.composicion.map(c => (
              <div key={c.grupo} className={BAR[c.grupo]} style={{ width: `${c.pct}%` }} title={`${c.grupo === 'sin_clasificar' ? 'Sin clasificar' : RISK_GROUPS[c.grupo].label}: ${c.pct.toFixed(0)}%`} />
            ))}
          </div>
          <ul className="space-y-1">
            {r.composicion.map(c => (
              <li key={c.grupo} className="flex items-center gap-2 text-[11px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${BAR[c.grupo]}`} />
                <span className="flex-1 text-gray-600 truncate">
                  {c.grupo === 'sin_clasificar' ? 'Sin clasificar' : `${RISK_GROUPS[c.grupo].label} (${RISK_GROUPS[c.grupo].puntaje})`}
                </span>
                <span className="text-gray-400">{usd(c.monto)}</span>
                <span className="w-9 text-right text-gray-700 font-semibold">{c.pct.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-400 pt-1">
            {r.posiciones.length} posiciones · {usd(r.montoTotal)}
            {fechaAct ? ` · actualizado ${new Date(fechaAct).toLocaleDateString('es-UY')}` : ''}
            {r.montoClasificado < r.montoTotal ? ' · lo sin clasificar no entra en el promedio' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
