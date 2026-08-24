'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { PortfolioPositionRow, PortfolioImportRow, PortfolioAccountInfo, PortfolioPerformanceRow, PortfolioCashProjectionRow, PortfolioCashProjectionsImportRow, PortfolioUnrealizedGainLossRow, PortfolioUnrealizedGainLossImportRow } from '@/types/portfolio'
import ImportPositionsModal from '@/components/portfolio/ImportPositionsModal'
import PositionsTab from './PositionsTab'
import RendimientoTab from './RendimientoTab'
import MovimientosTab from './MovimientosTab'
import ResumenTab from './ResumenTab'
import ImportHistoryModal from '@/components/portfolio/ImportHistoryModal'
import AccountPdfReport from './AccountPdfReport'
import { cleanDisplayName } from '@/lib/portfolio/theme'

// ── Brand ──────────────────────────────────────────────────────────────────
export const CHART_COLORS = ['#1B3A2B', '#2E7D52', '#4CAF72', '#81C995', '#A5D6B7', '#C8E6C9', '#6B7280']
export const ASSET_CLASS_ES: Record<string, string> = {
  'Equity': 'Renta Variable',
  'ETF': 'Renta Variable (ETF)',
  'Fixed Income': 'Fondos de Renta Fija / Crédito',
  'Alternatives': 'Otros',
  'Real Estate': 'Otros',
  'Cash': 'Money Market / Liquidez',
}

export const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const fmtUSD2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
export const fmtPct = (n: number, decimals = 1) => `${n.toFixed(decimals)}%`
export const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Fixed Income sub-classification (security_type → client-facing bucket) ──
function fixedIncomeBucket(securityType: string): string {
  const t = securityType.toLowerCase()
  if (/corporate/.test(t)) return 'Corporate Bonds'
  if (/government|treasury|sovereign|municipal/.test(t)) return 'Sovereign Bonds'
  if (/open.?end|closed.?end|mutual.?fund|interval.?fund/.test(t)) return 'Fixed Income Funds'
  if (/note|structured/.test(t)) return 'Structured / Notes'
  return 'Other'
}

type Tab = 'resumen' | 'posiciones' | 'rendimiento' | 'movimientos'

export default function PortfolioAccountClient({ accountNumber }: { accountNumber: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('resumen')
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<PortfolioAccountInfo | null>(null)
  const [importRow, setImportRow] = useState<PortfolioImportRow | null>(null)
  const [positions, setPositions] = useState<PortfolioPositionRow[]>([])
  const [history, setHistory] = useState<{ snapshot_date: string; total_market_value: string }[]>([])
  const [showImport, setShowImport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [performance, setPerformance] = useState<PortfolioPerformanceRow | null>(null)
  const [cashProjImport, setCashProjImport] = useState<PortfolioCashProjectionsImportRow | null>(null)
  const [cashProjRows, setCashProjRows] = useState<PortfolioCashProjectionRow[]>([])
  const [unrealizedGLImport, setUnrealizedGLImport] = useState<PortfolioUnrealizedGainLossImportRow | null>(null)
  const [unrealizedGLRows, setUnrealizedGLRows] = useState<PortfolioUnrealizedGainLossRow[]>([])

  async function load() {
    setLoading(true)
    const [detailRes, historyRes, perfRes, cashRes, glRes] = await Promise.all([
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/history`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/performance`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/cashflows`),
      fetch(`/api/portfolio/${encodeURIComponent(accountNumber)}/unrealizedgl`),
    ])
    if (detailRes.ok) {
      const d = await detailRes.json()
      setAccount(d.account); setImportRow(d.import); setPositions(d.positions)
    }
    if (historyRes.ok) setHistory(await historyRes.json())
    if (perfRes.ok) setPerformance((await perfRes.json()).performance)
    if (cashRes.ok) {
      const c = await cashRes.json()
      setCashProjImport(c.import); setCashProjRows(c.rows ?? [])
    }
    if (glRes.ok) {
      const g = await glRes.json()
      setUnrealizedGLImport(g.import); setUnrealizedGLRows(g.rows ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [accountNumber])

  // Cuentas que llegaron solo por import de Portfolio (nunca cargadas en
  // Monitoreo) no tienen fila en monitoring_base_accounts todavía — account.id
  // es null. En ese caso se crea la fila (upsert por account_number+entity)
  // en vez de intentar un PATCH que no tiene a qué apuntar.
  async function patchOrCreateAccount(updates: Record<string, unknown>) {
    if (account?.id) {
      await fetch(`/api/monitoring/accounts/${account.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      })
    } else {
      await fetch('/api/monitoring/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'roble', accounts: [{ account_number: accountNumber, ...updates }] }),
      })
      load()
    }
  }

  async function handleCustodianChange(custodian: string) {
    setAccount(a => a ? { ...a, custodian } : a)
    await patchOrCreateAccount({ custodian })
  }

  async function handleAccountNameChange(accountName: string) {
    setAccount(a => a ? { ...a, accountName } : a)
    await patchOrCreateAccount({ account_name: accountName })
  }

  const totalValue = importRow ? Number(importRow.total_market_value) : 0

  const previousSnapshot = useMemo(() => {
    if (!importRow || history.length < 2) return null
    const idx = history.findIndex(h => h.snapshot_date === importRow.snapshot_date)
    return idx > 0 ? history[idx - 1] : null
  }, [history, importRow])

  const variation = previousSnapshot
    ? { abs: totalValue - Number(previousSnapshot.total_market_value), pct: (totalValue - Number(previousSnapshot.total_market_value)) / Number(previousSnapshot.total_market_value) * 100 }
    : null

  const sortedByValue = useMemo(() => [...positions].sort((a, b) => Number(b.market_value) - Number(a.market_value)), [positions])

  const assetAllocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of positions) map.set(p.asset_class, (map.get(p.asset_class) ?? 0) + Number(p.market_value))
    return Array.from(map.entries())
      .map(([assetClass, value]) => ({ assetClass, label: ASSET_CLASS_ES[assetClass] ?? assetClass, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [positions, totalValue])

  const liquidity = useMemo(() => {
    const value = positions.filter(p => p.asset_class === 'Cash').reduce((s, p) => s + Number(p.market_value), 0)
    return { value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
  }, [positions, totalValue])

  const fixedIncomeBreakdown = useMemo(() => {
    const fi = positions.filter(p => p.asset_class === 'Fixed Income')
    const map = new Map<string, number>()
    for (const p of fi) {
      const bucket = fixedIncomeBucket(p.security_type ?? '')
      map.set(bucket, (map.get(bucket) ?? 0) + Number(p.market_value))
    }
    const fiTotal = fi.reduce((s, p) => s + Number(p.market_value), 0)
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value, pct: fiTotal > 0 ? (value / fiTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [positions])

  const currencyExposure = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of positions) map.set(p.currency, (map.get(p.currency) ?? 0) + Number(p.market_value))
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [positions, totalValue])

  const cleanedNames = useMemo(() => {
    const map = new Map<string, { name: string; detail: string | null }>()
    for (const p of positions) map.set(p.id, cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date))
    return map
  }, [positions])

  const projectedIncome12m = useMemo(() => {
    const today = new Date()
    const in12m = new Date(today); in12m.setFullYear(in12m.getFullYear() + 1)
    return cashProjRows
      .filter(r => { const d = new Date(r.pay_date + 'T00:00:00'); return d >= today && d <= in12m })
      .reduce((s, r) => s + (r.estimated_amount != null ? Number(r.estimated_amount) : 0), 0)
  }, [cashProjRows])

  const nextPayment = cashProjRows[0] ?? null

  // ── Unrealized Gain/Loss — real Cost Basis, matched to positions by CUSIP.
  // Never estimated: a position without a match in the uploaded file simply
  // has no gain/loss shown for it.
  const glByCusip = useMemo(() => {
    const map = new Map<string, PortfolioUnrealizedGainLossRow>()
    for (const r of unrealizedGLRows) map.set(r.cusip, r)
    return map
  }, [unrealizedGLRows])

  const unrealizedGLTotals = useMemo(() => {
    if (!unrealizedGLImport) return null
    let costBasis = 0, gainLoss = 0, matched = 0
    for (const p of positions) {
      const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
      if (!gl) continue
      matched++
      costBasis += Number(gl.cost_basis)
      gainLoss += Number(gl.gain_loss)
    }
    return { costBasis, gainLoss, pct: costBasis > 0 ? (gainLoss / costBasis) * 100 : 0, matched, total: positions.length }
  }, [positions, glByCusip, unrealizedGLImport])

  const gainLossByInvestment = useMemo(() => {
    return positions
      .map(p => {
        const gl = p.cusip ? glByCusip.get(p.cusip) : undefined
        if (!gl) return null
        const clean = cleanDisplayName(p.name, p.isin, p.cusip, p.coupon, p.maturity_date)
        return { id: p.id, name: clean.name, gainLoss: Number(gl.gain_loss), gainLossPct: Number(gl.gain_loss_pct) }
      })
      .filter((x): x is { id: string; name: string; gainLoss: number; gainLossPct: number } => x != null)
      .sort((a, b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss))
  }, [positions, glByCusip])

  const maturityBuckets = useMemo(() => {
    const withMaturity = positions.filter(p => p.maturity_date)
    const map = new Map<number, { value: number; count: number }>()
    for (const p of withMaturity) {
      const year = new Date(p.maturity_date as string).getUTCFullYear()
      const cur = map.get(year) ?? { value: 0, count: 0 }
      map.set(year, { value: cur.value + Number(p.market_value), count: cur.count + 1 })
    }
    return Array.from(map.entries()).map(([year, d]) => ({ year, ...d })).sort((a, b) => a.year - b.year)
  }, [positions])

  const nextMaturity = useMemo(() => {
    const withMaturity = positions.filter(p => p.maturity_date).sort((a, b) => (a.maturity_date as string).localeCompare(b.maturity_date as string))
    return withMaturity[0] ?? null
  }, [positions])

  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function handleDownloadPDF() {
    setDownloadingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const pages = Array.from(document.querySelectorAll('#account-pdf-report .pdf-page')) as HTMLElement[]
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      let firstPdfPage = true
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i]
        // Section boxes are marked data-pdf-keep-together so a slice
        // boundary never cuts through the middle of one — each logical
        // "page" div can legitimately grow past 297mm (more holdings, more
        // sections) and needs to spill onto extra physical PDF pages rather
        // than being squashed to fit a fixed height.
        const containerTop = pageEl.getBoundingClientRect().top
        const keepTogether = Array.from(pageEl.querySelectorAll('[data-pdf-keep-together]')).map(el => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return { top: (r.top - containerTop), bottom: (r.bottom - containerTop) }
        })
        const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: pageEl.scrollWidth })
        const scale = canvas.width / pageEl.scrollWidth
        const imgRatio = canvas.height / canvas.width
        const imgH = pdfW * imgRatio
        if (imgH <= pdfH) {
          if (!firstPdfPage) pdf.addPage()
          firstPdfPage = false
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, imgH)
        } else {
          const maxSliceH = Math.round(canvas.width * pdfH / pdfW)
          let position = 0
          while (position < canvas.height) {
            let sliceH = Math.min(canvas.height - position, maxSliceH)
            const pageEnd = position + sliceH
            for (const s of keepTogether) {
              const sTop = s.top * scale, sBottom = s.bottom * scale
              const sectionFits = (sBottom - sTop) <= maxSliceH
              const wouldBeCut = sTop < pageEnd && sBottom > pageEnd
              if (sectionFits && wouldBeCut && sTop > position) {
                sliceH = sTop - position
              }
            }
            const pageCanvas = document.createElement('canvas')
            pageCanvas.width = canvas.width
            pageCanvas.height = sliceH
            const ctx = pageCanvas.getContext('2d')!
            ctx.drawImage(canvas, 0, position, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
            if (!firstPdfPage) pdf.addPage()
            firstPdfPage = false
            const destH = pdfW * (sliceH / canvas.width)
            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, destH)
            position += sliceH
          }
        }
      }
      const clientName = (account?.clientName ?? accountNumber).replace(/\s+/g, '_')
      pdf.save(`Portfolio_${clientName}_${accountNumber}.pdf`)
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">Cargando…</div>
  }

  if (!importRow) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header router={router} account={account} accountNumber={accountNumber} importRow={null} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} onCustodianChange={handleCustodianChange} onAccountNameChange={handleAccountNameChange} />
        <div className="max-w-3xl mx-auto p-6 text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-gray-600">Todavía no hay posiciones importadas para esta cuenta</p>
          <button onClick={() => setShowImport(true)} className="mt-4 px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition">
            Importar posiciones
          </button>
        </div>
        {showImport && <ImportPositionsModal accountNumber={accountNumber} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header router={router} account={account} accountNumber={accountNumber} importRow={importRow} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)}
        onDownloadPdf={handleDownloadPDF} downloadingPdf={downloadingPdf} onCustodianChange={handleCustodianChange} onAccountNameChange={handleAccountNameChange} />
      <AccountPdfReport account={account} accountNumber={accountNumber} importRow={importRow} sortedByValue={sortedByValue}
        assetAllocation={assetAllocation} fixedIncomeBreakdown={fixedIncomeBreakdown} currencyExposure={currencyExposure}
        liquidity={liquidity} maturityBuckets={maturityBuckets} nextMaturity={nextMaturity}
        cashProjImport={cashProjImport} cashProjRows={cashProjRows} projectedIncome12m={projectedIncome12m}
        nextPayment={nextPayment} cleanedNames={cleanedNames} performance={performance}
        unrealizedGLTotals={unrealizedGLTotals} glByCusip={glByCusip} />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {([
            ['resumen', 'Resumen'], ['posiciones', 'Posiciones'], ['rendimiento', 'Rendimiento'], ['movimientos', 'Movimientos'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${tab === key ? 'border-[#2E7D52] text-[#1B3A2B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {tab === 'resumen' && (
          <ResumenTab
            accountNumber={accountNumber}
            totalValue={totalValue} snapshotDate={importRow.snapshot_date} variation={variation}
            positions={positions} assetAllocation={assetAllocation} fixedIncomeBreakdown={fixedIncomeBreakdown}
            currencyExposure={currencyExposure} liquidity={liquidity} sortedByValue={sortedByValue}
            maturityBuckets={maturityBuckets} nextMaturity={nextMaturity}
            cashProjImport={cashProjImport} projectedIncome12m={projectedIncome12m} nextPayment={nextPayment}
            cleanedNames={cleanedNames}
            unrealizedGLImport={unrealizedGLImport} unrealizedGLTotals={unrealizedGLTotals}
            gainLossByInvestment={gainLossByInvestment} onUnrealizedGLImported={load}
            onSeeAll={() => setTab('posiciones')}
          />
        )}
        {tab === 'posiciones' && (
          <PositionsTab positions={positions} totalValue={totalValue} glByCusip={glByCusip} />
        )}
        {tab === 'rendimiento' && (
          <RendimientoTab accountNumber={accountNumber} history={history} performance={performance} onPerformanceImported={load} />
        )}
        {tab === 'movimientos' && (
          <MovimientosTab accountNumber={accountNumber} cashProjImport={cashProjImport} cashProjRows={cashProjRows} onCashProjImported={load} />
        )}
      </div>

      {showImport && <ImportPositionsModal accountNumber={accountNumber} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
      {showHistory && <ImportHistoryModal accountNumber={accountNumber} onClose={() => setShowHistory(false)} />}
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({ router, account, accountNumber, importRow, onImport, onHistory, onDownloadPdf, downloadingPdf, onCustodianChange, onAccountNameChange }: {
  router: ReturnType<typeof useRouter>
  account: PortfolioAccountInfo | null
  accountNumber: string
  importRow: PortfolioImportRow | null
  onImport: () => void
  onHistory: () => void
  onDownloadPdf?: () => void
  downloadingPdf?: boolean
  onCustodianChange?: (custodian: string) => void
  onAccountNameChange?: (name: string) => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button onClick={() => router.push('/factsheet')} className="text-xs text-gray-400 hover:text-gray-600 transition mb-1">← Portafolio</button>
          {account?.clientName ? (
            <h1 className="text-lg font-bold text-gray-900 truncate">{account.clientName}</h1>
          ) : editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setEditingName(false); if (nameDraft.trim()) onAccountNameChange?.(nameDraft.trim()) }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                placeholder="Nombre del cliente"
                className="text-lg font-bold text-gray-900 border-b border-gray-300 focus:outline-none focus:border-[#2E7D52] bg-transparent w-full max-w-xs"
              />
              <button
                onClick={() => { setEditingName(false); if (nameDraft.trim()) onAccountNameChange?.(nameDraft.trim()) }}
                className="text-xs font-semibold text-white bg-[#2E7D52] hover:bg-[#256841] rounded px-2 py-1 shrink-0"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-xs text-gray-400 hover:text-gray-600 px-1 shrink-0"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <h1
              onClick={() => { if (account) { setNameDraft(account.accountName ?? ''); setEditingName(true) } }}
              className={`text-lg font-bold truncate ${account ? 'text-gray-900 cursor-pointer hover:underline decoration-dashed underline-offset-4' : 'text-gray-900'}`}
              title={account ? 'Click para completar el nombre del cliente' : undefined}
            >
              {account?.accountName || accountNumber}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
            <span>{accountNumber}</span>
            {account?.clientNumber && <span>· Cliente #{account.clientNumber}</span>}
            {account?.entity && <span>· {account.entity === 'roble' ? 'Roble Capital' : account.entity}</span>}
            {importRow && <span>· Actualizado al {fmtDate(importRow.snapshot_date)}</span>}
            {account && (
              <span className="flex items-center gap-1">
                · Custodio:
                <select
                  value={account.custodian ?? ''}
                  onChange={e => onCustodianChange?.(e.target.value)}
                  className="text-xs text-gray-500 border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none"
                >
                  <option value="">— sin definir —</option>
                  <option value="Pershing">Pershing</option>
                  <option value="Morgan Stanley">Morgan Stanley</option>
                </select>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onHistory} className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Historial de importaciones
          </button>
          {importRow && (
            <button onClick={onDownloadPdf} disabled={downloadingPdf}
              className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
              {downloadingPdf ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
          <button onClick={onImport} className="px-4 py-2 text-sm font-bold text-white bg-[#2E7D52] rounded-lg hover:bg-[#256841] transition">
            Importar posiciones
          </button>
        </div>
      </div>
    </div>
  )
}

