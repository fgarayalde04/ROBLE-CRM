'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalystSummary, Analyst, GenerateResponse, PreviewRow } from '@/lib/icheAcciones/types'

// Defensivo: un valor null/NaN acá no debe tumbar toda la página de preview
// (el archivo ya se generó y subió a OneDrive en este punto — un problema de
// datos en una fila no puede impedir ver el resto). NaN llega como null
// después de pasar por JSON, así que null == NaN a todos los efectos.
const money = (n: number | null) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }))
const pct = (n: number | null) => (n == null || Number.isNaN(n) || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(2)}%`)
const qty = (n: number | null) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-UY'))
const ratio = (gain: number, cost: number) => (cost !== 0 ? gain / cost : null)

// Identidad de cada estrategia (validado con el checker de dataviz: CVD ΔE 28.8).
// El color marca la estrategia; ganancia/pérdida va en verde/rojo con ▲▼.
const ANALYSTS: { key: Analyst; label: string; color: string; soft: string; border: string }[] = [
  { key: 'INDIO', label: 'Indio', color: '#D9741C', soft: '#FDF4EC', border: '#F3D3B5' },
  { key: 'CHINO', label: 'Chino', color: '#2F6FDB', soft: '#EEF3FC', border: '#C7D7F4' },
]

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

// Previews guardados antes de `porAnalista`: se arma desde las filas del
// resumen ("Cerradas CHINO 2025", "Cerradas INDIO", "Actuales Indio"...).
function summaryFromResumen(resumen: GenerateResponse['preview']['resumen']): Record<Analyst, AnalystSummary> {
  const out: Record<Analyst, AnalystSummary> = {
    INDIO: { abiertas: { cost: 0, value: 0, count: 0 }, cerradas: [] },
    CHINO: { abiertas: { cost: 0, value: 0, count: 0 }, cerradas: [] },
  }
  for (const r of resumen) {
    const m = r.label.match(/^(cerradas|actuales)\s+(indio|chino)(?:\s+(\d{4}))?$/i)
    if (!m) continue
    const a = m[2].toUpperCase() as Analyst
    if (m[1].toLowerCase() === 'actuales') out[a].abiertas = { cost: r.cost, value: r.value, count: 0 }
    else out[a].cerradas.push({ year: m[3] ? Number(m[3]) : 0, cost: r.cost, value: r.value, count: 0 })
  }
  return out
}

function Gain({ value, cost, big }: { value: number; cost: number; big?: boolean }) {
  const gain = value - cost
  const up = gain >= 0
  return (
    <span className={`${up ? 'text-green-700' : 'text-red-700'} ${big ? 'text-2xl font-semibold' : 'font-medium'} tabular-nums`}>
      {up ? '▲' : '▼'} {money(gain)}
      <span className={`${big ? 'ml-2 text-base' : 'ml-1 text-xs'} font-normal`}>({pct(ratio(gain, cost))})</span>
    </span>
  )
}

function YearRow({ label, cost, value, count, total }: { label: string; cost: number; value: number; count: number; total?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-0 ${total ? 'bg-gray-50' : ''}`}>
      <div className="min-w-0">
        <p className={`${total ? 'font-semibold' : 'font-medium'} text-[#2D3F52]`}>{label}</p>
        <p className="truncate text-xs text-gray-500 tabular-nums">
          {count ? `${count} op. · ` : ''}{money(cost)} → {money(value)}
        </p>
      </div>
      <span className="whitespace-nowrap"><Gain value={value} cost={cost} /></span>
    </li>
  )
}

function AnalystCard({ a, s }: { a: (typeof ANALYSTS)[number]; s: AnalystSummary }) {
  const realized = s.cerradas.reduce((t, c) => ({ cost: t.cost + c.cost, value: t.value + c.value, count: t.count + c.count }), { cost: 0, value: 0, count: 0 })
  const total = { cost: s.abiertas.cost + realized.cost, value: s.abiertas.value + realized.value }
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: a.border }}>
      <header className="flex items-center justify-between px-5 py-3" style={{ background: a.soft, borderTop: `4px solid ${a.color}` }}>
        <h3 className="flex items-center gap-2 text-base font-semibold text-[#2D3F52]">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: a.color }} />
          Estrategia {a.label}
        </h3>
        <span className="text-xs text-gray-500">Resultado total</span>
      </header>

      <div className="px-5 pb-5 pt-4">
        <Gain value={total.value} cost={total.cost} big />
        <p className="mt-1 text-xs text-gray-500">
          Invertido {money(total.cost)} · Valor actual + vendido {money(total.value)}
        </p>

        <div className="mt-4 rounded-lg border border-gray-200 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Abiertas{s.abiertas.count ? ` · ${s.abiertas.count} posiciones` : ''}</p>
            <span className="whitespace-nowrap"><Gain value={s.abiertas.value} cost={s.abiertas.cost} /></span>
          </div>
          <p className="mt-1 text-sm text-gray-600 tabular-nums">
            Costo {money(s.abiertas.cost)} → Valor {money(s.abiertas.value)}
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-gray-200">
          <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Cerradas por año</p>
          {s.cerradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Sin operaciones cerradas.</p>
          ) : (
            <ul className="text-sm">
              {s.cerradas.map(c => (
                <YearRow key={c.year} label={c.year ? String(c.year) : 'Todas'} {...c} />
              ))}
              {s.cerradas.length > 1 && <YearRow label="Total" {...realized} total />}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export default function PreviewTables({ preview, fileName, uploadedItem, fileBase64, warnings, downloadHref = '/api/admin/planillas/iche-acciones/download' }: GenerateResponse & { downloadHref?: string }) {
  const resumen = preview.porAnalista ?? summaryFromResumen(preview.resumen)

  // Ganancia realizada por año, una barra por estrategia, y al final la no
  // realizada de las abiertas.
  const years = Array.from(new Set(ANALYSTS.flatMap(a => resumen[a.key].cerradas.map(c => c.year)))).sort((x, y) => x - y)
  const chartData = [
    ...years.map(year => ({
      name: year ? `Cerradas ${year}` : 'Cerradas',
      ...Object.fromEntries(ANALYSTS.map(a => {
        const c = resumen[a.key].cerradas.find(x => x.year === year)
        return [a.label, c ? c.value - c.cost : 0]
      })),
    })),
    { name: 'Abiertas (no realizado)', ...Object.fromEntries(ANALYSTS.map(a => [a.label, resumen[a.key].abiertas.value - resumen[a.key].abiertas.cost])) },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <span>✅ <strong>{fileName}</strong> generado y guardado en OneDrive.</span>
        {fileBase64 ? (
          <button
            onClick={() => downloadXlsx(fileName, fileBase64)}
            className="rounded-md bg-[#1B4332] px-3 py-1.5 text-xs font-medium text-white"
          >
            Descargar Excel
          </button>
        ) : (
          <a href={downloadHref} className="rounded-md bg-[#1B4332] px-3 py-1.5 text-xs font-medium text-white">
            Descargar Excel
          </a>
        )}
        {uploadedItem.webUrl && (
          <a href={uploadedItem.webUrl} target="_blank" rel="noreferrer" className="underline">
            Abrir en Office Online
          </a>
        )}
      </div>

      {warnings.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" open={warnings.length <= 3}>
          <summary className="cursor-pointer font-medium">⚠️ {warnings.length} aviso(s) para revisar</summary>
          <ul className="mt-2 list-disc pl-5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {ANALYSTS.map(a => <AnalystCard key={a.key} a={a} s={resumen[a.key]} />)}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#2D3F52]">Ganancia/Pérdida por año y estrategia</h3>
        <p className="mb-3 text-xs text-gray-500">Realizada por año de venta, y no realizada de las posiciones abiertas.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={2} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={{ stroke: '#D1D5DB' }} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => money(typeof v === 'number' ? v : Number(v ?? 0))} cursor={{ fill: '#F3F4F6' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {ANALYSTS.map(a => (
              <Bar key={a.key} dataKey={a.label} fill={a.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {preview.nuevosCierres.length > 0 && (
        <PositionsTable title="Cierres nuevos este mes" rows={preview.nuevosCierres} />
      )}
      {ANALYSTS.map(a => (
        <PositionsTable
          key={a.key}
          title={`Abiertas — ${a.label}`}
          color={a.color}
          soft={a.soft}
          rows={a.key === 'INDIO' ? preview.abiertasIndio : preview.abiertasChino}
        />
      ))}
    </div>
  )
}

function PositionsTable({ title, rows, color = '#6B7280', soft = '#F9FAFB' }: { title: string; rows: PreviewRow[]; color?: string; soft?: string }) {
  const sorted = [...rows].sort((x, y) => (y.gainLossPct ?? 0) - (x.gainLossPct ?? 0))
  return (
    <details className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm" open>
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-semibold text-[#2D3F52]" style={{ background: soft, borderLeft: `4px solid ${color}` }}>
        {title}
        <span className="text-xs font-normal text-gray-500">· {rows.length} · ordenadas por rendimiento</span>
      </summary>
      <div className="mobile-scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Ticker</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Costo</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2 text-right">Ganancia/Pérdida</th>
              <th className="px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const up = r.gainLoss >= 0
              return (
                <tr key={`${r.ticker}-${i}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-1.5">
                    <span className="font-medium">{r.ticker}</span>
                    <span className="ml-2 hidden max-w-[18rem] truncate align-bottom text-xs text-gray-400 md:inline-block" title={r.description}>{r.description}</span>
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{qty(r.quantity)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{money(r.originalTotalCost)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{money(r.marketValue)}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums ${up ? 'text-green-700' : 'text-red-700'}`}>{up ? '▲' : '▼'} {money(r.gainLoss)}</td>
                  <td className="px-4 py-1.5 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {pct(r.gainLossPct)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
