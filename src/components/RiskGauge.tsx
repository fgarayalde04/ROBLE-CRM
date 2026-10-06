// Velocímetro de riesgo 0–10: semicírculo de verde (0) a rojo (10), aguja en el
// puntaje y, si hay perfil, una marca en su tope.

// Colores de los grupos de riesgo, compartidos por las barras de composición.
export const RISK_BAR: Record<string, string> = {
  liquidez: 'bg-emerald-300', rf_ig: 'bg-emerald-500', rf_ar: 'bg-amber-400', mixtos: 'bg-amber-300',
  rv_desarrollada: 'bg-orange-400', rv_especifica: 'bg-red-400', especulativo: 'bg-red-700', sin_clasificar: 'bg-gray-300',
}

const CX = 100, CY = 100, R = 78, W = 18

// Valor 0..10 → punto sobre el arco (0 a la izquierda, 10 a la derecha).
function point(v: number, r: number) {
  const a = Math.PI * (1 - v / 10)
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

// Verde (hue 130) → amarillo → rojo (hue 0).
function color(v: number) {
  return `hsl(${Math.round(130 - v * 13)}, 72%, 45%)`
}

export default function RiskGauge({
  puntaje,
  tope,
  size = 200,
  label,
}: {
  puntaje: number | null
  tope?: number | null
  size?: number
  label?: string | null
}) {
  const segs = 40
  const arcs = Array.from({ length: segs }, (_, i) => {
    const v0 = (i / segs) * 10
    const v1 = ((i + 1) / segs) * 10 + 0.02 // leve solape para que no se vean cortes
    const p0 = point(v0, R), p1 = point(Math.min(v1, 10), R)
    return <path key={i} d={`M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${p1.x} ${p1.y}`} stroke={color((v0 + v1) / 2)} strokeWidth={W} fill="none" />
  })

  const v = puntaje == null ? null : Math.max(0, Math.min(10, puntaje))
  const tip = v != null ? point(v, R - W / 2 - 6) : null
  const excede = v != null && tope != null && v > tope

  return (
    <div className="flex flex-col items-center" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox="0 0 200 118" width="100%" role="img" aria-label={v != null ? `Riesgo ${v.toFixed(1)} de 10` : 'Sin riesgo calculado'}>
        {arcs}
        {/* Escala */}
        {[0, 5, 10].map((t) => {
          const p = point(t, R + W / 2 + 7)
          return <text key={t} x={p.x} y={Math.min(p.y + 3, 114)} fontSize="9" textAnchor="middle" fill="#9CA3AF">{t}</text>
        })}
        {/* Tope del perfil */}
        {tope != null && tope < 10 && (() => {
          const a = point(tope, R - W / 2 - 2), b = point(tope, R + W / 2 + 2)
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1F2937" strokeWidth={2.5} strokeLinecap="round" />
        })()}
        {/* Aguja */}
        {tip ? (
          <>
            <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="#1F2937" strokeWidth={3.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={7} fill="#1F2937" />
            <circle cx={CX} cy={CY} r={2.5} fill="#fff" />
          </>
        ) : (
          <circle cx={CX} cy={CY} r={6} fill="#D1D5DB" />
        )}
      </svg>
      <div className="-mt-1 text-center">
        <p className={`text-2xl font-bold leading-none ${v == null ? 'text-gray-300' : excede ? 'text-red-600' : 'text-gray-900'}`}>
          {v != null ? v.toFixed(1) : '—'}
          <span className="text-xs font-normal text-gray-400"> / 10</span>
        </p>
        {label && <p className="text-[11px] text-gray-500 mt-1">{label}</p>}
      </div>
    </div>
  )
}
