'use client'
import { useState, useRef } from 'react'
import type { FactsheetData, ParsedFactsheet, FactsheetPosition, AllocationItem } from '@/types/factsheet'
import FactsheetPreview from '@/components/factsheet/FactsheetPreview'
import { mapAssetClass, mapRegion, mapSector } from '@/lib/factsheet-parser'

// ── Brand colors ──────────────────────────────────────────────────────────────
const ASSET_CLASS_COLORS: Record<string, string> = {
  'Cash':         '#6B7280',
  'Fixed Income': '#2E7D52',
  'Equity':       '#1B3A2B',
  'ETF':          '#4CAF72',
  'Alternatives': '#A5D6B7',
  'Real Estate':  '#C8E6C9',
  'Other':        '#E8F5E9',
}

const REGION_COLORS: Record<string, string> = {
  'USA':              '#1B3A2B',
  'LatAm':            '#2E7D52',
  'Europe':           '#4CAF72',
  'Emerging Markets': '#81C995',
  'Asia':             '#A5D6B7',
  'Global':           '#C8E6C9',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeAllocation(positions: FactsheetPosition[], totalValue: number) {
  const sum = (key: keyof FactsheetPosition, colorMap: Record<string, string>) => {
    const map = new Map<string, number>()
    for (const p of positions) {
      const k = String(p[key] ?? 'Other')
      map.set(k, (map.get(k) ?? 0) + p.marketValue)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name, value,
        pct:   totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: colorMap[name] ?? '#94A3B8',
      }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    byAssetClass: sum('assetClass', ASSET_CLASS_COLORS),
    bySector:     sum('sector',     {}),
    byRegion:     sum('region',     REGION_COLORS),
    byCurrency:   sum('currency',   {}),
  }
}

function computeRiskScore(positions: FactsheetPosition[]): number | null {
  const scored = positions.filter(p => p.riskScore != null && p.weight > 0)
  if (!scored.length) return null
  const totalW = scored.reduce((s, p) => s + p.weight, 0)
  return scored.reduce((s, p) => s + (p.riskScore! * p.weight), 0) / totalW
}

function riskProfile(score: number | null): string {
  if (score == null) return '—'
  if (score <= 3) return 'Conservador'
  if (score <= 6) return 'Moderado'
  return 'Agresivo'
}

const DEFAULT_DISCLAIMER = `Este documento ha sido preparado por Roble Capital con fines informativos y no constituye asesoramiento de inversión, oferta ni solicitud de compra o venta de valores. La información aquí contenida se basa en fuentes consideradas confiables, pero Roble Capital no garantiza su exactitud o integridad. El rendimiento pasado no garantiza resultados futuros. Las inversiones en valores conllevan riesgos, incluyendo la posible pérdida del capital invertido. Este material es confidencial y está destinado exclusivamente al cliente indicado.`

const EMPTY_FACTSHEET = (): FactsheetData => ({
  meta: { clientName: '', reportDate: '', advisor: '', quarter: '', accountNumber: '', benchmark: '', currency: 'USD' },
  positions: [],
  totalValue: 0,
  allocation: { byAssetClass: [], bySector: [], byRegion: [], byCurrency: [] },
  performance: { ytdReturn: undefined, return1y: undefined, return3y: undefined, return5y: undefined, inceptionReturn: undefined, history: [] },
  commentary:  { marketCommentary: '', outlook: '', strategy: '', portfolioChanges: '', recommendations: '' },
  disclaimer:  DEFAULT_DISCLAIMER,
  riskScore:   null,
  riskProfile: '—',
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function FactsheetClient() {
  const [step,        setStep]        = useState<'upload' | 'edit' | 'preview'>('upload')
  const [factsheet,   setFactsheet]   = useState<FactsheetData>(EMPTY_FACTSHEET())
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [warnings,    setWarnings]    = useState<string[]>([])
  const [history,     setHistory]     = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload & parse Excel ───────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/factsheet/parse', { method: 'POST', body: fd })
      const data: ParsedFactsheet & { error?: string } = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error al procesar el archivo')

      setWarnings(data.warnings ?? [])

      const totalValue = data.totalValue || data.positions.reduce((s, p) => s + p.marketValue, 0)
      const allocation = computeAllocation(data.positions, totalValue)
      const rs         = computeRiskScore(data.positions)

      // Determine quarter from date
      const today   = new Date()
      const quarter = `Q${Math.ceil((today.getMonth() + 1) / 3)} ${today.getFullYear()}`

      setFactsheet(prev => ({
        ...prev,
        meta: {
          ...prev.meta,
          clientName:    data.meta.clientName    ?? prev.meta.clientName,
          reportDate:    data.meta.reportDate    ?? today.toLocaleDateString('es-UY'),
          advisor:       data.meta.advisor       ?? prev.meta.advisor,
          accountNumber: data.meta.accountNumber ?? '',
          quarter:       prev.meta.quarter       || quarter,
        },
        positions:   data.positions,
        totalValue,
        allocation,
        riskScore:   rs,
        riskProfile: riskProfile(rs),
      }))
      setStep('edit')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Save to DB ─────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/factsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(factsheet),
      })
      if (!res.ok) throw new Error('Error al guardar')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Load history ───────────────────────────────────────────────────────────
  async function loadHistory() {
    const res  = await fetch('/api/factsheet')
    const data = await res.json()
    setHistory(data)
    setShowHistory(true)
  }

  function loadFromHistory(item: any) {
    setFactsheet(item.data)
    setShowHistory(false)
    setStep('edit')
  }

  // ── Field helpers ──────────────────────────────────────────────────────────
  const setMeta   = (k: string, v: string) => setFactsheet(f => ({ ...f, meta:      { ...f.meta,      [k]: v } }))
  const setComm   = (k: string, v: string) => setFactsheet(f => ({ ...f, commentary: { ...f.commentary, [k]: v } }))
  const setPerf   = (k: string, v: number) => setFactsheet(f => ({ ...f, performance:{ ...f.performance,[k]: v } }))

  // ── Print ──────────────────────────────────────────────────────────────────
  function handlePrint() {
    window.print()
  }

  // ── Download PDF ───────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPDF() {
    setDownloading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const wrapper = document.querySelector('.factsheet-wrapper') as HTMLElement
      if (!wrapper) return

      const pages = Array.from(wrapper.children) as HTMLElement[]
      const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          // Ensure the element is rendered at its natural width
          windowWidth: pages[i].scrollWidth,
        })

        if (i > 0) pdf.addPage()
        const imgData = canvas.toDataURL('image/jpeg', 0.97)
        // A4 = 210mm × 297mm
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      }

      const clientName = factsheet.meta.clientName
        ? factsheet.meta.clientName.replace(/\s+/g, '_')
        : 'portfolio'
      const quarter = factsheet.meta.quarter
        ? `_${factsheet.meta.quarter.replace(/\s+/g, '_')}`
        : ''
      pdf.save(`Factsheet_${clientName}${quarter}.pdf`)
    } catch (e: any) {
      setError('Error al generar PDF: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#1B3A2B] flex items-center justify-center">
            <span className="text-white text-xs font-bold">RC</span>
          </div>
          <span className="font-semibold text-gray-900">Portfolio Factsheet Generator</span>
          {factsheet.meta.clientName && (
            <span className="text-gray-400 text-sm">— {factsheet.meta.clientName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadHistory}
            className="text-sm px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Historial
          </button>
          {step !== 'upload' && (
            <>
              <button onClick={() => setStep(step === 'edit' ? 'preview' : 'edit')}
                className="text-sm px-3 py-1.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                {step === 'edit' ? '👁 Vista previa' : '✏️ Editar'}
              </button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm px-3 py-1.5 text-white bg-[#2E7D52] rounded-lg hover:bg-[#1B5E38] transition disabled:opacity-50">
                {saving ? 'Guardando…' : saved ? '✓ Guardado' : '💾 Guardar'}
              </button>
              <button onClick={handleDownloadPDF} disabled={downloading}
                className="text-sm px-4 py-1.5 text-white bg-[#1B3A2B] rounded-lg hover:bg-[#0F2419] transition font-medium disabled:opacity-60 disabled:cursor-wait">
                {downloading ? '⏳ Generando…' : '⬇ Descargar PDF'}
              </button>
              <button onClick={handlePrint}
                className="text-sm px-3 py-1.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                🖨 Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── History modal ── */}
      {showHistory && (
        <div className="no-print fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Historial de Factsheets</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-y-auto max-h-[56vh] divide-y">
              {!history.length && <div className="p-6 text-center text-gray-400 text-sm">No hay factsheets guardados</div>}
              {history.map(h => (
                <div key={h.id} className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center" onClick={() => loadFromHistory(h)}>
                  <div>
                    <div className="font-medium text-gray-900">{h.client_name || 'Sin nombre'}</div>
                    <div className="text-xs text-gray-500">{h.quarter} · {h.advisor} · {fmt(h.total_value)}</div>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(h.created_at).toLocaleDateString('es-UY')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex" style={{ minHeight: 'calc(100vh - 53px)' }}>

        {/* ── Left panel: controls (hidden when previewing for print) ── */}
        {step !== 'preview' && (
          <div className="no-print w-80 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
            <div className="p-5 space-y-6">

              {/* Upload */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Archivo</h3>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-[#2E7D52] hover:bg-green-50 transition"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
                >
                  {uploading
                    ? <span className="text-sm text-gray-500">Procesando…</span>
                    : <>
                        <div className="text-2xl mb-1">📊</div>
                        <div className="text-sm font-medium text-gray-700">Subir Excel Unrealized G/L</div>
                        <div className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</div>
                      </>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }} />
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                {warnings.map((w, i) => <p key={i} className="text-xs text-amber-600 mt-1">⚠ {w}</p>)}
              </section>

              {/* Client info */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cliente</h3>
                <div className="space-y-2">
                  {[
                    { key: 'clientName',    label: 'Nombre cliente',  placeholder: 'Ej: Juan García' },
                    { key: 'advisor',       label: 'Asesor',          placeholder: 'Ej: Francisco Garayalde' },
                    { key: 'quarter',       label: 'Período',         placeholder: 'Ej: Q2 2026' },
                    { key: 'reportDate',    label: 'Fecha reporte',   placeholder: 'Ej: 30/06/2026' },
                    { key: 'accountNumber', label: 'N° cuenta',       placeholder: 'Opcional' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-gray-500 mb-0.5">{f.label}</label>
                      <input
                        type="text"
                        value={(factsheet.meta as any)[f.key] ?? ''}
                        onChange={e => setMeta(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2E7D52]"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Performance */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Performance</h3>
                <div className="space-y-2">
                  {[
                    { key: 'ytdReturn',       label: 'YTD %'                    },
                    { key: 'return1y',        label: '1 Año anualizado %'        },
                    { key: 'return3y',        label: '3 Años anualizado %'       },
                    { key: 'return5y',        label: '5 Años anualizado %'       },
                    { key: 'inceptionReturn', label: 'Acumulado desde inicio %'  },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-gray-500 mb-0.5">{f.label}</label>
                      <input
                        type="number" step="0.01"
                        value={(factsheet.performance as any)[f.key] ?? ''}
                        onChange={e => setPerf(f.key, parseFloat(e.target.value))}
                        placeholder="0.00"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2E7D52]"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Commentary */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Comentario Asesor</h3>
                <div className="space-y-2">
                  {[
                    { key: 'marketCommentary', label: 'Market Commentary', rows: 4 },
                    { key: 'outlook',          label: 'Outlook',           rows: 3 },
                    { key: 'strategy',         label: 'Strategy',          rows: 3 },
                    { key: 'portfolioChanges', label: 'Portfolio Changes',  rows: 2 },
                    { key: 'recommendations',  label: 'Recommendations',   rows: 2 },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-gray-500 mb-0.5">{f.label}</label>
                      <textarea
                        rows={f.rows}
                        value={(factsheet.commentary as any)[f.key] ?? ''}
                        onChange={e => setComm(f.key, e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2E7D52] resize-none"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Disclaimer */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Disclaimer</h3>
                <textarea rows={4} value={factsheet.disclaimer}
                  onChange={e => setFactsheet(f => ({ ...f, disclaimer: e.target.value }))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#2E7D52] resize-none text-gray-500"
                />
              </section>

            </div>
          </div>
        )}

        {/* ── Right panel: preview ── */}
        <div className={`flex-1 overflow-y-auto ${step === 'preview' ? '' : 'bg-gray-100 p-6'}`}>
          {step === 'upload' ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <div className="text-5xl mb-4">📋</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Portfolio Factsheet Generator</h2>
              <p className="text-gray-400 text-sm max-w-sm">Subí el Excel de Unrealized Gain/Loss para generar automáticamente un factsheet institucional PDF.</p>
            </div>
          ) : (
            <FactsheetPreview data={factsheet} />
          )}
        </div>
      </div>
    </div>
  )
}
