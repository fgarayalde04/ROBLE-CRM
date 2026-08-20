// Hand-rolled SVG donut — deliberately not a charting library. It has to
// render identically in the live dashboard AND inside html2canvas's PDF
// capture, and canvas-based chart libs are unreliable in that second
// context (animations, portals, delayed paints). Plain SVG arcs paint
// synchronously and html2canvas handles inline SVG fine.
export interface DonutSegment {
  label: string
  value: number
  color: string
}

export default function DonutChart({ segments, size = 168, thickness = 26, centerLabel, centerSub }: {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerSub?: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const frac = total > 0 ? seg.value / total : 0
    const dash = frac * circumference
    const el = (
      <circle
        key={seg.label}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    )
    offset += dash
    return el
  })

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={thickness} />
        {arcs}
      </svg>
      {(centerLabel || centerSub) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none',
        }}>
          {centerLabel && <span style={{ fontSize: size * 0.1, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{centerLabel}</span>}
          {centerSub && <span style={{ fontSize: size * 0.055, color: '#9CA3AF', marginTop: 2 }}>{centerSub}</span>}
        </div>
      )}
    </div>
  )
}
