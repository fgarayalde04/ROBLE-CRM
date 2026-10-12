import type { GenerationHistoryRow } from '@/lib/icheAcciones/db'

const TZ = 'America/Montevideo'
const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-UY', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

// Una planilla por día: la última corrida (la que quedó en OneDrive), con los
// cierres nuevos sumados de todas las corridas de ese día.
function latestPerDay(rows: GenerationHistoryRow[]) {
  const byDay = new Map<string, { row: GenerationHistoryRow; runs: number; newCloses: number }>()
  for (const r of rows) { // vienen más nuevas primero
    const d = byDay.get(dia(r.createdAt))
    if (d) { d.runs += 1; d.newCloses += r.newCloses }
    else byDay.set(dia(r.createdAt), { row: r, runs: 1, newCloses: r.newCloses })
  }
  return Array.from(byDay.values())
}

function HistoryTable({ rows, apiBase }: { rows: { row: GenerationHistoryRow; runs?: number; newCloses: number }[]; apiBase: string }) {
  return (
    <div className="mobile-scroll-x rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Archivo</th>
            <th className="px-3 py-2">Generada por</th>
            <th className="px-3 py-2 text-right">Cierres nuevos</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row: r, runs, newCloses }) => (
            <tr key={r.id} className="border-b border-gray-100 last:border-0">
              <td className="whitespace-nowrap px-3 py-2">
                {fecha(r.createdAt)}
                {runs != null && runs > 1 && <span className="ml-2 text-xs text-gray-400">({runs} corridas)</span>}
              </td>
              <td className="px-3 py-2">{r.isSeed ? <span className="text-gray-400">{r.fileName}</span> : r.fileName}</td>
              <td className="px-3 py-2 text-gray-500">{r.isSeed ? 'Carga inicial' : r.generatedByName ?? '—'}</td>
              <td className="px-3 py-2 text-right">{r.isSeed ? '' : newCloses}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {r.downloadable && !r.isSeed && (
                  <a href={`${apiBase}/history/${r.id}`} className="font-medium text-[#1B4332] underline">Descargar Excel</a>
                )}
                {r.webUrl && (
                  <a href={r.webUrl} target="_blank" rel="noreferrer" className="ml-3 text-gray-500 underline">OneDrive</a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Historial de planillas generadas, con el Excel de cada una. Por defecto una
// por día (las corridas repetidas del mismo día quedan plegadas abajo).
export default function HistoryList({ rows, apiBase }: { rows: GenerationHistoryRow[]; apiBase: string }) {
  const perDay = latestPerDay(rows)
  return (
    <div className="mt-10 max-w-5xl">
      <h2 className="mb-2 text-sm font-semibold text-[#2D3F52]">Historial de planillas</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no se generó ninguna.</p>
      ) : (
        <>
          <HistoryTable rows={perDay} apiBase={apiBase} />
          {rows.length > perDay.length && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-gray-500 underline">Ver todas las corridas ({rows.length})</summary>
              <div className="mt-2">
                <HistoryTable rows={rows.map(r => ({ row: r, newCloses: r.newCloses }))} apiBase={apiBase} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
