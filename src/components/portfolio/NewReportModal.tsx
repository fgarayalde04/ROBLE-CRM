'use client'
import { useState, useRef } from 'react'
import type { ParsedPortfolioImport } from '@/lib/portfolio/parser'
import type { ParsedMorganHoldings } from '@/lib/portfolio/morganParser'

type CustodianMode = 'pershing' | 'morgan' | 'consolidado'

interface ResolvedAccount {
  accountNumber: string
  clientNumber: string | null
  clientName: string | null
  advisor: string | null
  entity: string | null
}

interface PershingParseResponse {
  parsed: ParsedPortfolioImport
  account: ResolvedAccount | null
  existingImport: { id: string; createdAt: string; positionCount: number; totalMarketValue: number } | null
  fileName: string
}

interface MorganParseResponse {
  parsed: ParsedMorganHoldings
  account: ResolvedAccount | null
  existingImport: { id: string; createdAt: string; positionCount: number; totalMarketValue: number } | null
  fileName: string
}

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Wizard "Nuevo Reporte": elegir Custodio (Pershing / Morgan Stanley /
// Consolidado) → subir el/los archivo(s) → previsualizar → confirmar. Para
// Pershing usa exactamente las mismas rutas que ImportPositionsModal
// (/api/portfolio/parse, /api/portfolio/import) — este wizard es una capa de
// UI nueva sobre el mismo camino de siempre, no un camino distinto. El
// número de cuenta es un único campo compartido entre ambos custodios en
// modo Consolidado: como Morgan Stanley nunca trae el número completo en su
// export, el asesor lo escribe una sola vez y ambas importaciones quedan
// bajo esa misma cuenta — así "mismo cliente" queda garantizado por
// construcción en vez de necesitar una validación cruzada aparte.
export default function NewReportModal({ onClose, onImported, initialMode, initialAccountNumber }: {
  onClose: () => void
  onImported: (accountNumber: string, custodianMode: CustodianMode) => void
  initialMode?: CustodianMode
  initialAccountNumber?: string
}) {
  const [step, setStep] = useState<'custodian' | 'upload' | 'preview' | 'importing' | 'done'>(initialMode ? 'upload' : 'custodian')
  const [mode, setMode] = useState<CustodianMode | null>(initialMode ?? null)
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber ?? '')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const [pershingPreview, setPershingPreview] = useState<PershingParseResponse | null>(null)
  const [morganPreview, setMorganPreview] = useState<MorganParseResponse | null>(null)
  const [morganIncomeFile, setMorganIncomeFile] = useState<File | null>(null)
  const [extraWarnings, setExtraWarnings] = useState<string[]>([])

  const pershingFileRef = useRef<HTMLInputElement>(null)
  const morganFileRef = useRef<HTMLInputElement>(null)
  const morganIncomeFileRef = useRef<HTMLInputElement>(null)

  async function handlePershingFile(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (accountNumber) fd.append('accountNumber', accountNumber)
      const res = await fetch('/api/portfolio/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al leer el archivo'); return }
      setPershingPreview(data)
      if (!accountNumber && data.parsed.accountNumber) setAccountNumber(data.parsed.accountNumber)
      if (mode === 'pershing') setStep('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleMorganFile(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (accountNumber) fd.append('accountNumber', accountNumber)
      const res = await fetch('/api/portfolio/morgan/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al leer el archivo'); return }
      setMorganPreview(data)
      if (mode === 'morgan') setStep('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function goToPreviewFromConsolidado() {
    if (!pershingPreview || !morganPreview) return
    setStep('preview')
  }

  async function handleConfirm() {
    const finalAccountNumber = accountNumber.trim().toUpperCase()
    if (!finalAccountNumber) { setError('Ingresá el número de cuenta'); return }
    setStep('importing'); setError('')
    const warnings: string[] = []

    try {
      if (mode === 'pershing' || mode === 'consolidado') {
        if (!pershingPreview) throw new Error('Falta el archivo de Pershing')
        const parsed = { ...pershingPreview.parsed, accountNumber: finalAccountNumber }
        const res = await fetch('/api/portfolio/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parsed, fileName: pershingPreview.fileName, replace: !!pershingPreview.existingImport }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al importar Pershing')
      }

      if (mode === 'morgan' || mode === 'consolidado') {
        if (!morganPreview) throw new Error('Falta el archivo de Morgan Stanley')
        const res = await fetch('/api/portfolio/morgan/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parsed: morganPreview.parsed, accountNumber: finalAccountNumber, fileName: morganPreview.fileName, replace: !!morganPreview.existingImport }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Error al importar Morgan Stanley')

        if (morganIncomeFile) {
          const fd = new FormData(); fd.append('file', morganIncomeFile)
          const r = await fetch(`/api/portfolio/morgan/${encodeURIComponent(finalAccountNumber)}/projectedincome`, { method: 'POST', body: fd })
          if (!r.ok) warnings.push('No se pudo importar el Projected Income: ' + ((await r.json().catch(() => ({}))).error ?? 'error desconocido'))
        }
      }

      setExtraWarnings(warnings)
      setStep('done')
      onImported(finalAccountNumber, mode as CustodianMode)
    } catch (e: any) {
      setError(e.message)
      setStep('preview')
    }
  }

  const canGoToPreview =
    mode === 'pershing' ? !!pershingPreview :
    mode === 'morgan' ? !!morganPreview :
    mode === 'consolidado' ? !!(pershingPreview && morganPreview) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-bold text-gray-900">Nuevo Reporte</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1">
          {step === 'custodian' && (
            <div className="space-y-2.5">
              <p className="text-xs text-gray-500 mb-3">Elegí el custodio del reporte que querés generar.</p>
              {([
                ['pershing', 'Pershing', 'Reporte con el flujo de siempre'],
                ['morgan', 'Morgan Stanley', 'Sube el export "Holdings - Cost Basis"'],
                ['consolidado', 'Consolidado Pershing + Morgan', 'Combina ambos custodios en un solo reporte'],
              ] as [CustodianMode, string, string][]).map(([key, label, hint]) => (
                <button key={key} onClick={() => { setMode(key); setStep('upload') }}
                  className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-[#2E7D52] hover:bg-green-50/40 transition">
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
                </button>
              ))}
            </div>
          )}

          {step === 'upload' && mode && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400">Número de cuenta</p>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder="Ej: ROJ902303"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2E7D52]/30 mt-1"
                />
                {mode === 'consolidado' && (
                  <p className="text-[11px] text-gray-400 mt-1">Se usa para las dos importaciones — así quedan ligadas al mismo cliente.</p>
                )}
              </div>

              {(mode === 'pershing' || mode === 'consolidado') && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Archivo Pershing</p>
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-[#2E7D52] hover:bg-green-50/50 transition"
                    onClick={() => pershingFileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePershingFile(f) }}
                  >
                    {pershingPreview ? (
                      <p className="text-xs font-medium text-emerald-700">✓ {pershingPreview.fileName}</p>
                    ) : uploading ? (
                      <span className="text-xs text-gray-500">Procesando…</span>
                    ) : (
                      <p className="text-xs text-gray-500">Subí el Excel de posiciones (.xlsx)</p>
                    )}
                  </div>
                  <input ref={pershingFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handlePershingFile(e.target.files[0]) }} />
                </div>
              )}

              {(mode === 'morgan' || mode === 'consolidado') && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Archivo Morgan Stanley</p>
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-[#2E7D52] hover:bg-green-50/50 transition"
                    onClick={() => morganFileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleMorganFile(f) }}
                  >
                    {morganPreview ? (
                      <p className="text-xs font-medium text-emerald-700">✓ {morganPreview.fileName}</p>
                    ) : uploading ? (
                      <span className="text-xs text-gray-500">Procesando…</span>
                    ) : (
                      <p className="text-xs text-gray-500">Subí "Holdings - Cost Basis" (.xlsx)</p>
                    )}
                  </div>
                  <input ref={morganFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleMorganFile(e.target.files[0]) }} />

                  <button onClick={() => morganIncomeFileRef.current?.click()}
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-xs hover:border-[#2E7D52] transition mt-2">
                    <span className="text-gray-600">{morganIncomeFile ? morganIncomeFile.name : 'Projected Income (Excel, opcional)'}</span>
                    <span className="font-semibold text-[#2E7D52] shrink-0 ml-2">{morganIncomeFile ? 'Cambiar' : 'Elegir archivo'}</span>
                  </button>
                  <input ref={morganIncomeFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => setMorganIncomeFile(e.target.files?.[0] ?? null)} />
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {step === 'preview' && mode && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Cuenta</p><p className="font-semibold text-gray-800">{accountNumber}</p></div>
                <div>
                  <p className="text-xs text-gray-400">Custodio(s)</p>
                  <p className="font-semibold text-gray-800">{mode === 'consolidado' ? 'Pershing + Morgan Stanley' : mode === 'morgan' ? 'Morgan Stanley' : 'Pershing'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Cliente</p>
                  <p className="font-semibold text-gray-800">{pershingPreview?.account?.clientName ?? morganPreview?.account?.clientName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Portfolio Value</p>
                  <p className="font-semibold text-gray-800">
                    {fmtUSD((pershingPreview?.parsed.totalMarketValue ?? 0) + (morganPreview?.parsed.portfolio.totalMarketValue ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Cantidad de posiciones</p>
                  <p className="font-semibold text-gray-800">
                    {(pershingPreview?.parsed.positions.length ?? 0) + (morganPreview?.parsed.portfolio.positions.length ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Unrealized G/L</p>
                  <p className="font-semibold text-gray-800">
                    {fmtUSD((morganPreview?.parsed.unrealizedGL.netGainLoss ?? 0))}
                  </p>
                </div>
                {pershingPreview && <div><p className="text-xs text-gray-400">Fecha valuación Pershing</p><p className="font-semibold text-gray-800">{pershingPreview.parsed.snapshotDate ?? '—'}</p></div>}
                {morganPreview && <div><p className="text-xs text-gray-400">Fecha valuación Morgan</p><p className="font-semibold text-gray-800">{morganPreview.parsed.portfolio.snapshotDate ?? '—'}</p></div>}
              </div>

              {mode === 'consolidado' && pershingPreview?.parsed.snapshotDate && morganPreview?.parsed.portfolio.snapshotDate &&
                pershingPreview.parsed.snapshotDate !== morganPreview.parsed.portfolio.snapshotDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  Las fechas de valuación no coinciden entre los dos custodios. El reporte se genera igual, pero tenelo en cuenta.
                </div>
              )}

              {(pershingPreview?.existingImport || morganPreview?.existingImport) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  Ya existe un snapshot para esa cuenta y fecha en al menos un custodio. Importar de nuevo lo va a <strong>reemplazar</strong>.
                </div>
              )}

              {[...(pershingPreview?.parsed.warnings ?? []), ...(morganPreview?.parsed.portfolio.warnings ?? [])].length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Observaciones</p>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {[...(pershingPreview?.parsed.warnings ?? []), ...(morganPreview?.parsed.portfolio.warnings ?? [])].map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-700">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-10 text-center text-sm text-gray-500">Procesando portafolio…</div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">Reporte generado</p>
              {extraWarnings.length > 0 && (
                <div className="mt-3 text-left bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mx-1">
                  {extraWarnings.map((w, i) => <p key={i} className="text-[11px] text-amber-700">• {w}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {step === 'upload' && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={() => setStep('custodian')} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Atrás
            </button>
            <button
              onClick={mode === 'consolidado' ? goToPreviewFromConsolidado : () => setStep('preview')}
              disabled={!canGoToPreview}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[#2E7D52] hover:bg-[#256841] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Continuar
            </button>
          </div>
        )}
        {step === 'preview' && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={() => setStep('upload')} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Atrás
            </button>
            <button
              onClick={handleConfirm}
              disabled={!accountNumber.trim()}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[#2E7D52] hover:bg-[#256841] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Generar Reporte
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-[#2D3F52] hover:bg-[#354A5E] transition">
              Ver reporte
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
