'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ClientSearchInput from '@/components/ClientSearchInput'
import { MESES, calendarWarnings, eventWithin12Months, money, pct, summarize, type CalendarWarning } from '@/lib/cupones/calc'
import { monthsFor, sortBonds } from '@/lib/cupones/parse'
import { renderCalendarHtml } from '@/lib/cupones/html'
import type { CouponBond, CouponCalendar, IncomingCashReport } from '@/lib/cupones/types'
import type { CouponCalendarRow } from '@/lib/db/couponCalendars'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const FRECUENCIAS = [
  { value: 2, label: 'Semestral' },
  { value: 4, label: 'Trimestral' },
  { value: 1, label: 'Anual' },
  { value: 12, label: 'Mensual' },
]

const WARN_STYLE: Record<CalendarWarning['level'], string> = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
}

export default function CuponesClient({ usuario, guardado, historial }: {
  usuario: string
  guardado: { id: string; clientId: string | null; calendar: CouponCalendar } | null
  historial: CouponCalendarRow[]
}) {
  const router = useRouter()
  const [cal, setCal] = useState<CouponCalendar | null>(guardado?.calendar ?? null)
  const [savedId, setSavedId] = useState<string | null>(guardado?.id ?? null)
  const [clientId, setClientId] = useState<string>(guardado?.clientId ?? '')
  const [clientLabel, setClientLabel] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/cupones/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo leer el archivo')
      const report = data.report as IncomingCashReport
      setCal({ ...report, clientName: report.accountShortName, advisor: usuario, docDate: todayIso() })
      setSavedId(null)
      setClientId(data.client?.id ?? '')
      setClientLabel(data.client ? `${data.client.name} (cuenta ${report.accountNumber})` : '')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // "Abrir" otro calendario del historial (cambia ?id=) lo carga en pantalla.
  useEffect(() => {
    if (!guardado || guardado.id === savedId) return
    setCal(guardado.calendar)
    setSavedId(guardado.id)
    setClientId(guardado.clientId ?? '')
    setClientLabel('')
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardado?.id])

  function setField<K extends keyof CouponCalendar>(k: K, v: CouponCalendar[K]) {
    setCal((c) => (c ? { ...c, [k]: v } : c))
  }

  function updateBond(i: number, patch: Partial<CouponBond>, resort = false) {
    setCal((c) => {
      if (!c) return c
      const bonds = c.bonds.map((b, j) => (j === i ? { ...b, ...patch } : b))
      return { ...c, bonds: resort ? sortBonds(bonds) : bonds }
    })
  }

  async function exportar(format: 'xlsx' | 'pdf') {
    if (!cal) return
    setBusy(format)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/cupones/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, calendar: cal, id: savedId, clientId: clientId || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo generar el archivo')
      const id = res.headers.get('X-Calendar-Id')
      if (id) setSavedId(id)
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `Calendario_Cupones.${format}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      setNotice(id ? (clientId ? 'Guardado en la ficha del cliente.' : 'Guardado en el historial (sin cliente vinculado).') : 'Descargado (no se pudo guardar en el historial).')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const warnings = useMemo(() => (cal ? calendarWarnings(cal) : []), [cal])
  const blocking = !!cal && cal.bonds.some((b) => b.needsFrequency || !(b.nominal > 0) || !(b.couponRate > 0) || !b.payMonths.length)

  return (
    <div className="space-y-6">
      <UploadBox uploading={uploading} onFile={upload} compact={!!cal} />
      {error && <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</div>}

      {cal && (
        <>
          <section className="bg-white border border-gray-200 rounded-lg p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Datos del documento</h2>
              <span className="text-xs text-gray-400">
                Cuenta {cal.accountNumber}{cal.accountShortName ? ` · ${cal.accountShortName}` : ''}{cal.asOfDate ? ` · reporte al ${fmtDate(cal.asOfDate)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Cliente (en el documento)">
                <input value={cal.clientName} onChange={(e) => setField('clientName', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Asesor">
                <input value={cal.advisor} onChange={(e) => setField('advisor', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Fecha del documento">
                <input type="date" value={cal.docDate} onChange={(e) => e.target.value && setField('docDate', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Guardar en la ficha de">
                <ClientSearchInput value={clientId} onChange={(id) => setClientId(id)} placeholder="Buscar cliente…" />
                {clientLabel && clientId && <p className="text-[11px] text-gray-400 mt-1">Encontrado por la cuenta: {clientLabel}</p>}
                {!clientId && <p className="text-[11px] text-amber-700 mt-1">Sin cliente: se guarda solo en el historial.</p>}
              </Field>
            </div>
          </section>

          {warnings.length > 0 && (
            <section className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className={`px-4 py-2.5 rounded-lg border text-sm ${WARN_STYLE[w.level]}`}>{w.text}</div>
              ))}
            </section>
          )}

          <BondsEditor cal={cal} onChange={updateBond} />

          <section className="bg-white border border-gray-200 rounded-lg p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Vista previa</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {notice && <span className="text-xs text-emerald-700">{notice}</span>}
                <button type="button" disabled={!!busy || blocking} onClick={() => exportar('xlsx')} className={BTN_SECONDARY}>
                  {busy === 'xlsx' ? 'Generando…' : 'Descargar Excel'}
                </button>
                <button type="button" disabled={!!busy || blocking} onClick={() => exportar('pdf')} className={BTN_PRIMARY}>
                  {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
                </button>
              </div>
            </div>
            {blocking && <p className="text-xs text-red-700 mb-3">Resolvé los avisos en rojo antes de exportar.</p>}
            <Preview cal={cal} />
          </section>
        </>
      )}

      <Historial historial={historial} actual={savedId} />
    </div>
  )
}

const INPUT = 'w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-[#2D3F52]'
const CELL_INPUT = 'w-full border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-[#2D3F52]'
const BTN_PRIMARY = 'px-4 py-2 text-sm font-semibold bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-50'
const BTN_SECONDARY = 'px-4 py-2 text-sm font-semibold border border-[#2D3F52] text-[#2D3F52] rounded-lg hover:bg-gray-50 disabled:opacity-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function UploadBox({ uploading, onFile, compact }: { uploading: boolean; onFile: (f: File) => void; compact: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
      className={`border-2 border-dashed rounded-lg text-center transition ${over ? 'border-[#2D3F52] bg-gray-50' : 'border-gray-200 bg-white'} ${compact ? 'p-3' : 'p-8'}`}
    >
      <input ref={ref} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      {!compact && <p className="text-sm text-gray-600 mb-3">Arrastrá acá el .xlsx del reporte Incoming Cash, o elegilo:</p>}
      <button type="button" disabled={uploading} onClick={() => ref.current?.click()} className={compact ? BTN_SECONDARY : BTN_PRIMARY}>
        {uploading ? 'Leyendo…' : compact ? 'Subir otro reporte' : 'Elegir archivo'}
      </button>
    </div>
  )
}

// ── Bonos editables ─────────────────────────────────────────────────────────

function BondsEditor({ cal, onChange }: { cal: CouponCalendar; onChange: (i: number, p: Partial<CouponBond>, resort?: boolean) => void }) {
  const s = summarize(cal)
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Bonos ({cal.bonds.length})</h2>
        <p className="text-xs text-gray-500">
          Nominal <b className="text-gray-800">{money(s.nominal, false)}</b> · Renta anual <b className="text-gray-800">{money(s.annual, false)}</b> · Rto. corriente <b className="text-gray-800">{pct(s.currentYield)}</b>
        </p>
      </div>
      <p className="px-4 md:px-5 pb-3 text-xs text-gray-400">
        Todo lo leído de la descripción se puede corregir. Las filas en amarillo vencen o tienen call dentro de los próximos 12 meses.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium w-[22%]">Emisor / descripción</th>
              <th className="px-2 py-2 font-medium">ISIN</th>
              <th className="px-2 py-2 font-medium">Nominal</th>
              <th className="px-2 py-2 font-medium">Cupón %</th>
              <th className="px-2 py-2 font-medium">Frecuencia</th>
              <th className="px-2 py-2 font-medium">Meses de pago · día</th>
              <th className="px-2 py-2 font-medium">Vencimiento</th>
              <th className="px-2 py-2 font-medium">Call</th>
              <th className="px-2 py-2 font-medium">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {cal.bonds.map((b, i) => {
              const ev = eventWithin12Months(b, cal.docDate)
              const freq = b.payMonths.length
              return (
                <tr key={b.cusip + i} className={`border-t border-gray-100 align-top ${ev ? 'bg-amber-50' : ''} ${b.needsFrequency ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2">
                    <input value={b.issuer} onChange={(e) => onChange(i, { issuer: e.target.value })} className={`${CELL_INPUT} font-semibold`} />
                    <p className="mt-1 text-[10px] text-gray-400 leading-snug">{b.description}</p>
                    <p className="text-[10px] text-gray-400">CUSIP {b.cusip}{b.payments.length ? ` · ${b.payments.length} pago(s) en el reporte` : ''}</p>
                    {ev && <p className="text-[10px] font-semibold text-amber-800 mt-0.5">{ev === 'vence' ? 'Vence' : 'Call'} dentro de 12 meses</p>}
                  </td>
                  <td className="px-2 py-2 w-32">
                    <input value={b.isin ?? ''} placeholder="(usa CUSIP)" onChange={(e) => onChange(i, { isin: e.target.value.trim().toUpperCase() || null })} className={CELL_INPUT} />
                  </td>
                  <td className="px-2 py-2 w-28">
                    <input type="number" min={0} step={1000} value={b.nominal} onChange={(e) => onChange(i, { nominal: Number(e.target.value) })} className={`${CELL_INPUT} text-right text-blue-700`} />
                  </td>
                  <td className="px-2 py-2 w-24">
                    <input
                      type="number" min={0} step={0.001}
                      value={Number((b.couponRate * 100).toFixed(6))}
                      onChange={(e) => onChange(i, { couponRate: Number(e.target.value) / 100 })}
                      className={`${CELL_INPUT} text-right text-blue-700`}
                    />
                    {b.rateFromPayments != null && b.rateFromDescription != null && (
                      <p className="text-[10px] text-gray-400 mt-0.5">pagos: {pct(b.rateFromPayments, 3)}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 w-28">
                    <select
                      value={FRECUENCIAS.some((f) => f.value === freq) ? freq : ''}
                      onChange={(e) => onChange(i, { payMonths: monthsFor(b.payMonths[0] ?? 1, Number(e.target.value)) }, true)}
                      className={CELL_INPUT}
                    >
                      {!FRECUENCIAS.some((f) => f.value === freq) && <option value="">{freq} pagos</option>}
                      {FRECUENCIAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {b.needsFrequency && (
                      <button type="button" onClick={() => onChange(i, { needsFrequency: false })} className="mt-1 w-full px-2 py-1 text-[11px] font-semibold rounded bg-red-600 text-white hover:bg-red-700">
                        Confirmar frecuencia
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-0.5 max-w-[260px]">
                      {MESES.map((m, k) => {
                        const on = b.payMonths.includes(k + 1)
                        return (
                          <button
                            key={m} type="button"
                            onClick={() => onChange(i, { payMonths: on ? b.payMonths.filter((x) => x !== k + 1) : [...b.payMonths, k + 1].sort((x, y) => x - y) }, true)}
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? 'bg-[#1B2A38] text-white border-[#1B2A38]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}
                          >
                            {m}
                          </button>
                        )
                      })}
                    </div>
                    <label className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                      Día
                      <input type="number" min={1} max={31} value={b.payDay} onChange={(e) => onChange(i, { payDay: Number(e.target.value) }, true)} className={`${CELL_INPUT} w-14`} />
                    </label>
                  </td>
                  <td className="px-2 py-2 w-32">
                    <input type="date" value={b.maturity ?? ''} onChange={(e) => onChange(i, { maturity: e.target.value || null })} className={CELL_INPUT} />
                    {!b.maturity && <p className="text-[10px] text-gray-400 mt-0.5">Perpetuo</p>}
                  </td>
                  <td className="px-2 py-2 w-32">
                    <input type="date" value={b.callDate ?? ''} disabled={b.nonCallable} onChange={(e) => onChange(i, { callDate: e.target.value || null })} className={`${CELL_INPUT} disabled:opacity-40`} />
                    <label className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                      <input type="checkbox" checked={b.nonCallable} onChange={(e) => onChange(i, { nonCallable: e.target.checked })} /> No rescatable (N/C)
                    </label>
                  </td>
                  <td className="px-2 py-2 w-24">
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input type="checkbox" checked={b.fixedFloat} onChange={(e) => onChange(i, { fixedFloat: e.target.checked })} /> Fija/flot.
                    </label>
                    <p className="text-[10px] text-gray-400 mt-1 text-right">{money(s.rows[i].reduce((t, v) => t + v, 0), false)}/año</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Vista previa: el mismo HTML que se imprime a PDF ────────────────────────

function Preview({ cal }: { cal: CouponCalendar }) {
  const html = useMemo(() => renderCalendarHtml(cal), [cal])
  const boxRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(794)
  const [multi, setMulti] = useState(false)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 1123)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function onLoad() {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    const isMulti = doc.body.dataset.fit === 'multi'
    setMulti(isMulti)
    setHeight(isMulti ? doc.documentElement.scrollHeight : 794)
  }

  return (
    <div ref={boxRef} className="w-full">
      {multi && <p className="text-xs text-amber-800 mb-2">No entra en una hoja: el PDF va a ocupar varias hojas A4 (la tabla continúa con el encabezado repetido).</p>}
      <div className="border border-gray-200 shadow-sm overflow-hidden" style={{ width: 1123 * scale, height: height * scale }}>
        <iframe
          ref={frameRef}
          title="Vista previa del calendario"
          srcDoc={html}
          onLoad={onLoad}
          sandbox="allow-scripts allow-same-origin"
          style={{ width: 1123, height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
    </div>
  )
}

// ── Historial ───────────────────────────────────────────────────────────────

function Historial({ historial, actual }: { historial: CouponCalendarRow[]; actual: string | null }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  if (historial.length === 0) return null
  const term = q.trim().toLowerCase()
  const visibles = historial.filter((h) => !term || `${h.client_name} ${h.account_number} ${h.created_by ?? ''}`.toLowerCase().includes(term))

  async function borrar(h: CouponCalendarRow) {
    if (!confirm(`¿Borrar el calendario de ${h.client_name} del ${fmtDate(h.doc_date)}?`)) return
    const res = await fetch(`/api/cupones/${h.id}`, { method: 'DELETE' })
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error ?? 'No se pudo borrar')
    if (actual === h.id) router.push('/plantillas/cupones')
    router.refresh()
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 md:px-5 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Calendarios generados</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o cuenta…" className="border border-gray-200 rounded px-2.5 py-1.5 text-xs w-56" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400">
            <tr className="text-left">
              <th className="px-5 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium text-right">Bonos</th>
              <th className="px-3 py-2 font-medium text-right">Renta anual</th>
              <th className="px-3 py-2 font-medium">Generado por</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((h) => (
              <tr key={h.id} className={`border-t border-gray-100 ${h.id === actual ? 'bg-blue-50/50' : ''}`}>
                <td className="px-5 py-2.5">
                  {h.client_id ? <Link href={`/clients/${h.client_id}`} className="text-blue-600 hover:underline">{h.client_name}</Link> : h.client_name}
                </td>
                <td className="px-3 py-2.5 text-gray-500">{h.account_number}</td>
                <td className="px-3 py-2.5 text-gray-500">{fmtDate(h.doc_date)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{h.bonds_count}</td>
                <td className="px-3 py-2.5 text-right">{money(Number(h.annual_income), false)}</td>
                <td className="px-3 py-2.5 text-gray-500">{h.created_by ?? '—'} · {fmtDate(h.created_at.slice(0, 10))}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <Link href={`/plantillas/cupones?id=${h.id}`} className="text-xs text-blue-600 hover:underline mr-3">Abrir</Link>
                  <button type="button" onClick={() => borrar(h)} className="text-xs text-gray-400 hover:text-red-600">Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
