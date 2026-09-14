// Plantilla imprimible fuera de pantalla, capturada con html2canvas + jsPDF
// por FondosMonitorClient.handleDownloadPdf — nunca se muestra al usuario
// directamente, se monta posicionada fuera de la vista pero con layout real.
//
// Replica al pixel el formato del monitor original en Excel/PDF (logo solo
// en el encabezado, columna YTD resaltada en verde, banda gris de categoría,
// subcategoría en caja con borde, números en negro sin +/% y con coma
// decimal) — colores y estructura sacados de un PDF de referencia que el
// usuario adjuntó, pidiendo que la descarga quedara igual.

const PAGE_PAD_MM = 12
const PAGE_STYLE: React.CSSProperties = {
  width: '210mm',
  background: '#fff',
  padding: `${PAGE_PAD_MM}mm`,
  fontFamily: 'Arial, sans-serif',
  boxSizing: 'border-box',
}

const HEADER_BG = '#333E4F'
const YTD_BG = '#538235'
const YTD_COL_TINT = '#F1F2F1'
const CATEGORY_BG = '#A5A6A5'
const BORDER = '#000'

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

function fmtNum(n: number | null) {
  if (n == null) return '-'
  return n.toFixed(2).replace('.', ',')
}

const COLS: { key: keyof FundRow; label: string; highlight?: boolean }[] = [
  { key: 'r_1y', label: '1A' },
  { key: 'r_3y', label: '3A' },
  { key: 'r_5y', label: '5A' },
  { key: 'r_ytd', label: 'YTD', highlight: true },
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

  return (
    <div style={PAGE_STYLE}>
      <div style={{ marginBottom: '5mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/download.png" alt="Roble Capital" style={{ height: '10mm', objectFit: 'contain' }} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 7, border: `0.3mm solid ${BORDER}` }}>
        <thead>
          <tr style={{ background: HEADER_BG }} data-pdf-keep-together>
            <th style={{ padding: '1.6mm 2mm', textAlign: 'center', color: '#fff', fontSize: 6.5, fontWeight: 700 }}>NOMBRE</th>
            {COLS.map(c => (
              <th
                key={c.key}
                style={{
                  padding: '1.6mm 1mm', textAlign: 'center', color: '#fff', fontSize: 6.5, fontWeight: 700,
                  background: c.highlight ? YTD_BG : HEADER_BG, width: '7.3%',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {grouped.map(({ key: categoria, items: catRows }) => {
          const subgroups = groupInOrder(catRows, f => f.subcategoria ?? '')
          return (
            <tbody key={categoria}>
              <tr data-pdf-keep-together>
                <td colSpan={COLS.length + 1} style={{ padding: '1.4mm 2mm', textAlign: 'center', fontWeight: 700, fontSize: 7, color: '#fff', background: CATEGORY_BG, border: `0.3mm solid ${BORDER}` }}>
                  {categoria}
                </td>
              </tr>
              {subgroups.map(({ key: subcategoria, items: rows }) => (
                <tbody key={subcategoria || '_'} data-pdf-keep-together={rows.length <= 8 ? true : undefined}>
                  {subcategoria && (
                    <tr>
                      <td colSpan={COLS.length + 1} style={{ padding: '1mm 2mm', fontWeight: 700, fontSize: 7, color: '#000', border: `0.3mm solid ${BORDER}` }}>
                        {subcategoria}
                      </td>
                    </tr>
                  )}
                  {rows.map(f => (
                    <tr key={f.id}>
                      <td style={{ padding: '1mm 2mm', color: '#000', fontSize: 6.8, borderBottom: `0.15mm solid #ddd` }}>
                        {f.nombre}
                      </td>
                      {COLS.map(c => (
                        <td
                          key={c.key}
                          style={{
                            padding: '1mm 1mm', textAlign: 'right', color: '#000', fontSize: 6.8,
                            borderBottom: '0.15mm solid #ddd', background: c.highlight ? YTD_COL_TINT : undefined,
                          }}
                        >
                          {fmtNum(f[c.key] as number | null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
