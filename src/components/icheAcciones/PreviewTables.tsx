'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GenerateResponse } from '@/lib/icheAcciones/types'

// Defensivo: un valor null/NaN acá no debe tumbar toda la página de preview
// (el archivo ya se generó y subió a OneDrive en este punto — un problema de
// datos en una fila no puede impedir ver el resto). NaN llega como null
// después de pasar por JSON, así que null == NaN a todos los efectos.
const money = (n: number | null) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }))
const pct = (n: number | null) => (n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(2)}%`)
const qty = (n: number | null) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-UY'))

function downloadXlsx(fileName: string, fileBase64: string) {
  const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function PreviewTables({ preview, fileName, uploadedItem, fileBase64, warnings }: GenerateResponse) {
  const realizedChartData = preview.resumen.slice(0, 4).map(r => ({ name: r.label.replace('Cerradas ', ''), ganancia: r.gainLoss }))
  const actualesChartData = preview.resumen.slice(4).map(r => ({ name: r.label.replace('Actuales ', ''), Costo: r.cost, 'Valor de mercado': r.value }))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <span>✅ <strong>{fileName}</strong> generado y guardado en OneDrive.</span>
        {fileBase64 && (
          <button
            onClick={() => downloadXlsx(fileName, fileBase64)}
            className="rounded-md bg-[#1B4332] px-3 py-1.5 text-xs font-medium text-white"
          >
            Descargar Excel
          </button>
        )}
        {uploadedItem.webUrl && (
          <a href={uploadedItem.webUrl} target="_blank" rel="noreferrer" className="underline">
            Abrir en Office Online
          </a>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Avisos</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[#2D3F52]">Resumen</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1">Categoría</th>
              <th>Costo</th>
              <th>Valor</th>
              <th>Ganancia/Pérdida</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {preview.resumen.map(r => (
              <tr key={r.label} className="border-b border-gray-100">
                <td className="py-1">{r.label}</td>
                <td>{money(r.cost)}</td>
                <td>{money(r.value)}</td>
                <td className={r.gainLoss >= 0 ? 'text-green-700' : 'text-red-700'}>{money(r.gainLoss)}</td>
                <td>{pct(r.gainLossPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[#2D3F52]">Ganancia/Pérdida realizada</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={realizedChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(typeof v === 'number' ? v : Number(v ?? 0))} />
              <Bar dataKey="ganancia" fill="#597C40" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[#2D3F52]">Cartera actual: Costo vs. Valor</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={actualesChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(typeof v === 'number' ? v : Number(v ?? 0))} />
              <Legend />
              <Bar dataKey="Costo" fill="#77787B" />
              <Bar dataKey="Valor de mercado" fill="#597C40" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {preview.nuevosCierres.length > 0 && (
        <PositionsTable title="Cierres nuevos este mes" rows={preview.nuevosCierres} />
      )}
      <PositionsTable title="Abiertas — Indio" rows={preview.abiertasIndio} />
      <PositionsTable title="Abiertas — Chino" rows={preview.abiertasChino} />
    </div>
  )
}

function PositionsTable({ title, rows }: { title: string; rows: GenerateResponse['preview']['abiertasIndio'] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-[#2D3F52]">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-1">Ticker</th>
            <th>Cantidad</th>
            <th>Costo</th>
            <th>Valor</th>
            <th>Ganancia/Pérdida</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.ticker} className="border-b border-gray-100">
              <td className="py-1 font-medium">{r.ticker}</td>
              <td>{qty(r.quantity)}</td>
              <td>{money(r.originalTotalCost)}</td>
              <td>{money(r.marketValue)}</td>
              <td className={r.gainLoss >= 0 ? 'text-green-700' : 'text-red-700'}>{money(r.gainLoss)}</td>
              <td>{pct(r.gainLossPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
