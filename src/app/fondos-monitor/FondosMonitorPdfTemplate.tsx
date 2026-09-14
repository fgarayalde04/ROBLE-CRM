import { COLORS } from '@/lib/portfolio/theme'

// Plantilla imprimible fuera de pantalla, capturada con html2canvas + jsPDF
// por FondosMonitorClient.handleDownloadPdf — nunca se muestra al usuario
// directamente, se monta posicionada fuera de la vista pero con layout real.

const PAGE_PAD_MM = 12
const PAGE_STYLE: React.CSSProperties = {
  width: '297mm',
  background: '#fff',
  padding: `${PAGE_PAD_MM}mm`,
  fontFamily: 'Arial, sans-serif',
  boxSizing: 'border-box',
}

interface FundRow {
  id: string
  isin: string
  nombre: string
  moneda: string | null
  categoria: string | null
  subcategoria: string | null
  as_of_date: string | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
  status: 'ok' | 'stale' | 'no_source' | 'error' | null
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function pctColor(n: number | null) {
  if (n == null) return COLORS.mutedSlate
  return n >= 0 ? COLORS.gain : COLORS.loss
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ok:        { label: 'OK',         color: COLORS.gain, bg: COLORS.gainSoft },
  stale:     { label: 'STALE',      color: '#B45309',   bg: '#FEF3C7' },
  no_source: { label: 'SIN FUENTE', color: COLORS.mutedSlate, bg: COLORS.bgSofter },
  error:     { label: 'ERROR',      color: COLORS.loss, bg: COLORS.lossSoft },
}

const COLS: { key: keyof FundRow; label: string }[] = [
  { key: 'r_1y', label: '1A' },
  { key: 'r_3y', label: '3A' },
  { key: 'r_5y', label: '5A' },
  { key: 'r_ytd', label: 'YTD' },
  { key: 'y_2025', label: '2025' },
  { key: 'y_2024', label: '2024' },
  { key: 'y_2023', label: '2023' },
  { key: 'y_2022', label: '2022' },
  { key: 'y_2021', label: '2021' },
]

function groupInOrder<T>(items: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = []
  const byKey = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    let arr = byKey.get(key)
    if (!arr) { arr = []; byKey.set(key, arr); groups.push({ key, items: arr }) }
    arr.push(item)
  }
  return groups
}

export default function FondosMonitorPdfTemplate({ funds }: { funds: FundRow[] }) {
  const grouped = groupInOrder(funds, f => f.categoria ?? 'Sin categoría')
  const generatedAt = new Date().toLocaleString('es-UY', { dateStyle: 'long', timeStyle: 'short' })

  return (
      <div style={PAGE_STYLE}>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            borderBottom: `2px solid ${COLORS.darkGreen}`, paddingBottom: '3mm', marginBottom: '5mm',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/download.png" alt="Roble Capital" style={{ height: '9mm', objectFit: 'contain' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.darkGreen }}>Monitor de Fondos</div>
            <div style={{ fontSize: 7.5, color: COLORS.mutedSlate, marginTop: '0.6mm' }}>
              {funds.length} fondos · Generado el {generatedAt}
            </div>
          </div>
        </div>

        {grouped.map(({ key: categoria, items: catRows }) => {
          const subgroups = groupInOrder(catRows, f => f.subcategoria ?? '')
          return (
            <div key={categoria} style={{ marginBottom: '6mm' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: COLORS.darkGreen, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '2mm' }}>
                {categoria}
              </div>
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 7 }}>
                  <thead>
                    <tr style={{ background: COLORS.charcoal }}>
                      <th style={{ padding: '2mm 2.5mm', textAlign: 'left', color: '#fff', fontSize: 6.3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Nombre</th>
                      {COLS.map(c => (
                        <th key={c.key} style={{ padding: '2mm 1.5mm', textAlign: 'right', color: '#fff', fontSize: 6.3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, width: '19mm' }}>
                          {c.label}
                        </th>
                      ))}
                      <th style={{ padding: '2mm 1.5mm', textAlign: 'center', color: '#fff', fontSize: 6.3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, width: '18mm' }}>Estado</th>
                    </tr>
                  </thead>
                  {subgroups.map(({ key: subcategoria, items: rows }) => (
                    <tbody key={subcategoria || '_'} data-pdf-keep-together={rows.length <= 10 ? true : undefined}>
                      {subcategoria && (
                        <tr>
                          <td colSpan={COLS.length + 2} style={{ padding: '1.8mm 2.5mm', fontSize: 7, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4, background: COLORS.midGreen }}>
                            {subcategoria}
                          </td>
                        </tr>
                      )}
                      {rows.map((f, i) => {
                        const st = STATUS_LABEL[f.status ?? 'no_source']
                        return (
                          <tr key={f.id} style={{ background: i % 2 === 1 ? COLORS.bgSoft : '#fff' }}>
                            <td style={{ padding: '1.8mm 2.5mm', borderBottom: `0.3mm solid ${COLORS.border}` }}>
                              <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 7 }}>{f.nombre}</div>
                              <div style={{ fontSize: 5.8, color: COLORS.mutedSlate, marginTop: '0.4mm' }}>
                                {f.isin} · {f.moneda ?? '—'}
                              </div>
                            </td>
                            {COLS.map(c => (
                              <td key={c.key} style={{ padding: '1.8mm 1.5mm', textAlign: 'right', borderBottom: `0.3mm solid ${COLORS.border}`, color: pctColor(f[c.key] as number | null), fontWeight: 600, fontSize: 6.6 }}>
                                {fmtPct(f[c.key] as number | null)}
                              </td>
                            ))}
                            <td style={{ padding: '1.8mm 1.5mm', textAlign: 'center', borderBottom: `0.3mm solid ${COLORS.border}` }}>
                              <span style={{ fontSize: 5.6, fontWeight: 800, padding: '0.6mm 1.6mm', borderRadius: 3, color: st.color, background: st.bg }}>
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          )
        })}
      </div>
  )
}
