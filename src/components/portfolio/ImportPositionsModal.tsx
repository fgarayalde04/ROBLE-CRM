'use client'
import { useState, useRef } from 'react'
import type { ParsedPortfolioImport } from '@/lib/portfolio/parser'

interface ResolvedAccount {
  accountNumber: string
  clientNumber: string | null
  clientName: string | null
  advisor: string | null
  entity: string | null
}

interface ParseResponse {
  parsed: ParsedPortfolioImport
  account: ResolvedAccount
  existingImport: { id: string; createdAt: string; positionCount: number; totalMarketValue: number } | null
  fileName: string
}

const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Modal compartido de "Importar posiciones" — subir Excel, previsualizar,
// confirmar. Usado tanto en la landing de cuentas como dentro del dashboard
// de una cuenta puntual (donde ya sabemos accountNumber, aunque igual se
// valida contra lo que diga el archivo).
export default function ImportPositionsModal({ onClose, onImported }: {
  onClose: () => void
  onImported: (accountNumber: string) => void
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<ParseResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Cuenta nueva desde cero: los otros dos documentos (opcionales) se suben
  // junto con las posiciones para no forzar 3 pasos separados.
  const [cashFile, setCashFile] = useState<File | null>(null)
  const [perfFile, setPerfFile] = useState<File | null>(null)
  const cashFileRef = useRef<HTMLInputElement>(null)
  const perfFileRef = useRef<HTMLInputElement>(null)
  const [extraWarnings, setExtraWarnings] = useState<string[]>([])

  async function handleFile(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portfolio/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al leer el archivo'); return }
      setPreview(data)
      setStep('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm(replace = false) {
    if (!preview) return
    setStep('importing'); setError('')
    try {
      const res = await fetch('/api/portfolio/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: preview.parsed, fileName: preview.fileName, replace }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('Ya existe un snapshot para esa cuenta y fecha.')
          setStep('preview')
          return
        }
        setError(data.error ?? 'Error al importar')
        setStep('preview')
        return
      }

      const accountNumber = preview.parsed.accountNumber!
      const warnings: string[] = []
      const uploads: Promise<void>[] = []
      if (cashFile) {
        uploads.push((async () => {
          const fd = new FormData(); fd.append('file', cashFile)
          const r = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/cashflows`, { method: 'POST', body: fd })
          if (!r.ok) warnings.push('No se pudo importar el Excel de Cash Projections: ' + ((await r.json().catch(() => ({}))).error ?? 'error desconocido'))
        })())
      }
      if (perfFile) {
        uploads.push((async () => {
          const fd = new FormData(); fd.append('file', perfFile)
          const r = await fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/performance`, { method: 'POST', body: fd })
          if (!r.ok) warnings.push('No se pudo importar el PDF de Performance: ' + ((await r.json().catch(() => ({}))).error ?? 'error desconocido'))
        })())
      }
      if (uploads.length) await Promise.all(uploads)

      setExtraWarnings(warnings)
      setStep('done')
      onImported(accountNumber)
    } catch (e: any) {
      setError(e.message)
      setStep('preview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-bold text-gray-900">Importar posiciones</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div>
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#2E7D52] hover:bg-green-50/50 transition"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              >
                {uploading ? (
                  <span className="text-sm text-gray-500">Procesando…</span>
                ) : (
                  <>
                    <div className="text-3xl mb-2">📊</div>
                    <p className="text-sm font-medium text-gray-700">Subí el Excel de posiciones</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx · .xls</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
              {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Cuenta detectada</p><p className="font-semibold text-gray-800">{preview.parsed.accountNumber}</p></div>
                <div><p className="text-xs text-gray-400">Cliente</p><p className="font-semibold text-gray-800">{preview.account.clientName ?? '—'}</p></div>
                <div><p className="text-xs text-gray-400">Fecha</p><p className="font-semibold text-gray-800">{preview.parsed.snapshotDate ?? '—'}</p></div>
                <div><p className="text-xs text-gray-400">Moneda</p><p className="font-semibold text-gray-800">{preview.parsed.baseCurrency}</p></div>
                <div><p className="text-xs text-gray-400">Cantidad de posiciones</p><p className="font-semibold text-gray-800">{preview.parsed.positions.length}</p></div>
                <div><p className="text-xs text-gray-400">Market Value total</p><p className="font-semibold text-gray-800">{fmtUSD(preview.parsed.totalMarketValue)}</p></div>
              </div>

              {preview.existingImport && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  Ya existe un snapshot de esta cuenta para esta fecha ({preview.existingImport.positionCount} posiciones, {fmtUSD(preview.existingImport.totalMarketValue)}).
                  Importar de nuevo lo va a <strong>reemplazar</strong>.
                </div>
              )}

              {preview.parsed.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Importado con observaciones</p>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {preview.parsed.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-700">• {w}</li>)}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Vista previa</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-gray-500">Activo</th>
                        <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-gray-500">Market Value</th>
                        <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-gray-500">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.parsed.positions.slice(0, 6).map((p, i) => (
                        <tr key={i}>
                          <td className="px-2.5 py-1.5 text-gray-700 truncate max-w-[220px]">{p.name}</td>
                          <td className="px-2.5 py-1.5 text-right text-gray-700 font-mono">{fmtUSD(p.marketValue)}</td>
                          <td className="px-2.5 py-1.5 text-right text-gray-500">{p.weight.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.parsed.positions.length > 6 && (
                    <div className="px-2.5 py-1.5 text-[11px] text-gray-400 bg-gray-50">…y {preview.parsed.positions.length - 6} más</div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Documentos adicionales (opcional)</p>
                <p className="text-[11px] text-gray-400 mb-2">Se importan junto con las posiciones — no hace falta subirlos por separado después.</p>
                <div className="space-y-2">
                  <button onClick={() => cashFileRef.current?.click()}
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-xs hover:border-[#2E7D52] transition">
                    <span className="text-gray-600">{cashFile ? cashFile.name : 'Incoming Cash Projections (Excel)'}</span>
                    <span className="font-semibold text-[#2E7D52] shrink-0 ml-2">{cashFile ? 'Cambiar' : 'Elegir archivo'}</span>
                  </button>
                  <input ref={cashFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => setCashFile(e.target.files?.[0] ?? null)} />

                  <button onClick={() => perfFileRef.current?.click()}
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-xs hover:border-[#2E7D52] transition">
                    <span className="text-gray-600">{perfFile ? perfFile.name : 'Portfolio Performance (PDF)'}</span>
                    <span className="font-semibold text-[#2E7D52] shrink-0 ml-2">{perfFile ? 'Cambiar' : 'Elegir archivo'}</span>
                  </button>
                  <input ref={perfFileRef} type="file" accept=".pdf" className="hidden"
                    onChange={e => setPerfFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-10 text-center text-sm text-gray-500">Importando…</div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800">Importación completa</p>
              {extraWarnings.length > 0 && (
                <div className="mt-3 text-left bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mx-1">
                  {extraWarnings.map((w, i) => <p key={i} className="text-[11px] text-amber-700">• {w}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {step !== 'importing' && step !== 'done' && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </button>
            {step === 'preview' && (
              <button
                onClick={() => handleConfirm(!!preview?.existingImport)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[#2E7D52] hover:bg-[#256841] transition"
              >
                {preview?.existingImport ? 'Reemplazar e importar' : 'Confirmar importación'}
              </button>
            )}
          </div>
        )}
        {step === 'done' && (
          <div className="px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-[#2D3F52] hover:bg-[#354A5E] transition">
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
