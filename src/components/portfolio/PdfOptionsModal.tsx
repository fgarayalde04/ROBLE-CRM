'use client'
import { useState } from 'react'

export type PerformancePeriodKey = 'ytd' | 'oneYear' | 'threeYear' | 'fiveYear' | 'sinceInception'

export interface PdfSections {
  performance: boolean
  composicion: boolean
  holdings: boolean
  income: boolean
  dividendos: boolean
  // Qué períodos de rentabilidad (TWRR) mostrar dentro de Performance —
  // solo afecta este PDF puntual, nunca la pestaña Rendimiento en pantalla.
  performancePeriods: Record<PerformancePeriodKey, boolean>
}

export const DEFAULT_PDF_SECTIONS: PdfSections = {
  performance: true,
  composicion: true,
  holdings: true,
  income: true,
  dividendos: true,
  performancePeriods: { ytd: true, oneYear: true, threeYear: true, fiveYear: true, sinceInception: true },
}

const ITEMS: { key: keyof Omit<PdfSections, 'performancePeriods'>; label: string; desc: string }[] = [
  { key: 'performance', label: 'Performance', desc: 'Valor de la cuenta, rentabilidad (TWRR) y gráficos de evolución.' },
  { key: 'composicion', label: 'Composición y renta', desc: 'Asset allocation, monedas, liquidez, unrealized y rendimiento del income.' },
  { key: 'holdings',    label: 'Posiciones', desc: 'Listado completo de holdings agrupado por clase de activo.' },
  { key: 'income',      label: 'Cupones y dividendos', desc: 'Projected income — próximos cobros estimados por instrumento.' },
  { key: 'dividendos',  label: 'Dividendos cobrados', desc: 'Resumen de la planilla manual de Dividendos: total cobrado y rendimiento anualizado por fondo.' },
]

const PERIOD_ITEMS: { key: PerformancePeriodKey; label: string }[] = [
  { key: 'ytd', label: 'YTD' },
  { key: 'oneYear', label: '1 Año' },
  { key: 'threeYear', label: '3 Años' },
  { key: 'fiveYear', label: '5 Años' },
  { key: 'sinceInception', label: 'Desde inicio' },
]

export default function PdfOptionsModal({
  initial, initialIncomeYieldPct, onCancel, onGenerate,
}: {
  initial: PdfSections
  initialIncomeYieldPct?: string
  onCancel: () => void
  onGenerate: (sections: PdfSections, incomeYieldPct: string) => void
}) {
  const [sections, setSections] = useState<PdfSections>(initial)
  const [incomeYieldPct, setIncomeYieldPct] = useState(initialIncomeYieldPct ?? '')
  const toggle = (k: keyof Omit<PdfSections, 'performancePeriods'>) => setSections(s => ({ ...s, [k]: !s[k] }))
  const togglePeriod = (k: PerformancePeriodKey) => setSections(s => ({ ...s, performancePeriods: { ...s.performancePeriods, [k]: !s.performancePeriods[k] } }))
  const anyOn = ITEMS.some(it => sections[it.key])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">¿Qué incluir en el reporte?</p>
          <p className="text-xs text-gray-400 mt-0.5">La portada y las disclosures van siempre.</p>
        </div>
        <div className="px-5 py-3 space-y-1 max-h-[60vh] overflow-y-auto">
          {ITEMS.map(it => (
            <label key={it.key} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={sections[it.key]}
                onChange={() => toggle(it.key)}
                className="mt-0.5 w-4 h-4 rounded accent-[#2E7D52]"
              />
              <span>
                <span className="block text-sm font-medium text-gray-800">{it.label}</span>
                <span className="block text-[11px] text-gray-400 leading-snug">{it.desc}</span>
              </span>
            </label>
          ))}
          {sections.performance && (
            <div className="mt-1 p-2.5 rounded-lg bg-gray-50">
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Períodos de rentabilidad (TWRR) a mostrar</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {PERIOD_ITEMS.map(p => (
                  <label key={p.key} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections.performancePeriods[p.key]}
                      onChange={() => togglePeriod(p.key)}
                      className="w-3.5 h-3.5 rounded accent-[#2E7D52]"
                    />
                    <span className="text-xs text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 leading-snug mt-1.5">Solo afecta este PDF — la pestaña Rendimiento en pantalla sigue mostrando todos los períodos.</p>
            </div>
          )}
          {sections.composicion && (
            <div className="mt-1 p-2.5 rounded-lg bg-gray-50">
              <label className="block text-sm font-medium text-gray-800 mb-1">Rendimiento estimado del income (%)</label>
              <input
                type="number"
                step="0.01"
                value={incomeYieldPct}
                onChange={e => setIncomeYieldPct(e.target.value)}
                placeholder="Calculalo a mano y completalo acá"
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-[#2E7D52]/50"
              />
              <p className="text-[11px] text-gray-400 leading-snug mt-1">Va tal cual en el reporte — no se calcula automáticamente. Dejalo vacío para que salga &quot;—&quot;.</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-xs font-semibold text-gray-500 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={() => onGenerate(sections, incomeYieldPct)}
            disabled={!anyOn}
            className="px-4 py-2 text-xs font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition disabled:opacity-40"
          >
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
