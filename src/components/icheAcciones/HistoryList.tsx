import type { GenerationHistoryRow } from '@/lib/icheAcciones/db'

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-UY', { timeZone: 'America/Montevideo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Historial de planillas generadas, con el Excel de cada corrida.
export default function HistoryList({ rows, apiBase }: { rows: GenerationHistoryRow[]; apiBase: string }) {
  return (
    <div className="mt-10 max-w-3xl">
      <h2 className="mb-2 text-sm font-semibold text-[#2D3F52]">Historial de planillas</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no se generó ninguna.</p>
      ) : (
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
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{fecha(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.isSeed ? <span className="text-gray-400">{r.fileName}</span> : r.fileName}</td>
                  <td className="px-3 py-2 text-gray-500">{r.isSeed ? 'Carga inicial' : r.generatedByName ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{r.isSeed ? '' : r.newCloses}</td>
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
      )}
    </div>
  )
}
