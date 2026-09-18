'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import FondosMonitorPdfTemplate from './FondosMonitorPdfTemplate'

interface FundRow {
  id: string
  isin: string
  nombre: string
  moneda: string | null
  categoria: string | null
  subcategoria: string | null
  as_of_date: string | null
  r_1m: number | null
  r_3m: number | null
  r_1y: number | null
  r_3y: number | null
  r_5y: number | null
  r_ytd: number | null
  y_2025: number | null
  y_2024: number | null
  y_2023: number | null
  y_2022: number | null
  y_2021: number | null
  source: string | null
  status: 'ok' | 'stale' | 'no_source' | 'error' | null
  error_message: string | null
  fetched_at: string | null
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function pctColor(n: number | null) {
  if (n == null) return 'text-gray-300'
  return n >= 0 ? 'text-emerald-600' : 'text-red-500'
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ok:         { label: 'OK',         color: 'bg-emerald-50 text-emerald-700' },
  stale:      { label: 'STALE',      color: 'bg-amber-50 text-amber-700' },
  no_source:  { label: 'SIN FUENTE', color: 'bg-gray-100 text-gray-500' },
  error:      { label: 'ERROR',      color: 'bg-red-50 text-red-600' },
}

const COLS: { key: keyof FundRow; label: string }[] = [
  { key: 'r_1y', label: '1A' },
  { key: 'r_3y', label: '3A' },
  { key: 'r_5y', label: '5A' },
  { key: 'r_ytd', label: 'YTD' },
  { key: 'y_2025', label: '2025' },
  { key: 'y_2024', label: '2024' },
  { key: 'y_2023', label: '2023' },
  { key: 'y_2022', label: '2022' },
  { key: 'y_2021', label: '2021' },
]

// Los fondos llegan ya en el orden del Excel (sort_order) — agrupar
// simplemente por orden de aparición reproduce esa misma estructura de
// categoría → subcategoría, sin necesidad de un orden fijo a mano.
// Clave de un grupo categoría + subcategoría ('' = fondos sin subcategoría).
function pdfGroupKey(categoria: string, subcategoria: string) {
  return `${categoria}\u0000${subcategoria}`
}

function groupInOrder<T>(items: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = []
  const byKey = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    let arr = byKey.get(key)
    if (!arr) { arr = []; byKey.set(key, arr); groups.push({ key, items: arr }) }
    arr.push(item)
  }
  return groups
}

const CATEGORIAS_CONOCIDAS = [
  'RENTA FIJA', 'BALANCEADOS / MULTI-ASSET', 'ALTERNATIVOS', 'RENTA VARIABLE', 'REAL ESTATE', 'COMMODITIES',
]

export default function FondosMonitorClient({ funds }: { funds: FundRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingFund, setEditingFund] = useState<FundRow | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [showPdfMenu, setShowPdfMenu] = useState(false)
  // Grupos (categoría + subcategoría) que el usuario destildó para el PDF — se
  // guarda lo excluido (no lo incluido) para que un grupo nuevo entre tildado
  // por defecto. Clave: pdfGroupKey().
  const [pdfExcluidas, setPdfExcluidas] = useState<Set<string>>(new Set())
  const pdfRef = useRef<HTMLDivElement>(null)

  const filteredFunds = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? funds.filter(f => f.nombre.toLowerCase().includes(q) || f.isin.toLowerCase().includes(q))
      : funds
  }, [funds, search])

  const grouped = useMemo(() => groupInOrder(filteredFunds, f => f.categoria ?? 'Sin categoría'), [filteredFunds])

  // Secciones que se pueden elegir para el PDF: cada categoría con sus
  // subcategorías (y cuántos fondos quedan según el buscador actual). Los
  // fondos sin subcategoría van en un grupo propio de clave ''.
  const pdfSecciones = useMemo(
    () => grouped.map(g => ({
      key: g.key,
      count: g.items.length,
      subs: groupInOrder(g.items, f => f.subcategoria ?? '').map(sg => ({
        key: sg.key,
        id: pdfGroupKey(g.key, sg.key),
        count: sg.items.length,
      })),
    })),
    [grouped]
  )
  const pdfFunds = useMemo(
    () => filteredFunds.filter(f => !pdfExcluidas.has(pdfGroupKey(f.categoria ?? 'Sin categoría', f.subcategoria ?? ''))),
    [filteredFunds, pdfExcluidas]
  )
  const toggleGrupos = (ids: string[], incluir: boolean) =>
    setPdfExcluidas(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (incluir) next.delete(id)
        else next.add(id)
      }
      return next
    })

  // Listas conocidas para los selects del alta: categorías fijas del Excel
  // primero, más cualquier otra que ya haya aparecido en los datos; las
  // subcategorías se ordenan por categoría a partir de lo que ya existe.
  const categoriasDisponibles = useMemo(() => {
    const existentes = Array.from(new Set(funds.map(f => f.categoria).filter((c): c is string => !!c)))
    return Array.from(new Set([...CATEGORIAS_CONOCIDAS, ...existentes]))
  }, [funds])

  const subcategoriasPorCategoria = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const f of funds) {
      if (!f.categoria || !f.subcategoria) continue
      const arr = map.get(f.categoria) ?? []
      if (!arr.includes(f.subcategoria)) arr.push(f.subcategoria)
      map.set(f.categoria, arr)
    }
    return map
  }, [funds])

  const lastUpdate = funds
    .map(f => f.fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  // Mismo patrón que ProposalEditor.handleDownloadPDF: se captura la
  // plantilla fuera de pantalla con html2canvas y se pagina el canvas
  // resultante en jsPDF, cortando en los bloques marcados
  // data-pdf-keep-together para no partir una subcategoría chica al medio.
  const handleDownloadPdf = async () => {
    if (!pdfRef.current) return
    setDownloadingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const scale = 3
      const containerTop = pdfRef.current.getBoundingClientRect().top
      const keepTogether = Array.from(pdfRef.current.querySelectorAll('[data-pdf-keep-together]')).map(el => {
        const r = (el as HTMLElement).getBoundingClientRect()
        return { top: (r.top - containerTop) * scale, bottom: (r.bottom - containerTop) * scale }
      })
      // Bloque "logo + encabezado de columnas" (marcado con data-pdf-header-end
      // en la plantilla) — se vuelve a pegar arriba de CADA página del PDF, en
      // vez de aparecer solo en la primera y dejar las siguientes como una
      // continuación muda de la tabla sin saber qué es cada columna.
      const headerEl = pdfRef.current.querySelector('[data-pdf-header-end]')
      const headerEndPx = headerEl
        ? ((headerEl as HTMLElement).getBoundingClientRect().bottom - containerTop) * scale
        : 0
      const canvas = await html2canvas(pdfRef.current, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: pdfRef.current.scrollWidth,
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgRatio = canvas.height / canvas.width
      const imgH = pdfW * imgRatio
      if (imgH <= pdfH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, imgH)
      } else {
        // Margen abajo de cada hoja física — sin esto, una fila que justo
        // entraba al límite quedaba pegada al borde de la página, sin aire.
        const marginPx = Math.round(canvas.width * 10 / pdfW)
        const maxPagePx = Math.round(canvas.width * pdfH / pdfW) - marginPx
        const contentBudgetPx = maxPagePx - headerEndPx
        let position = headerEndPx
        while (position < canvas.height) {
          let sliceH = Math.min(canvas.height - position, contentBudgetPx)
          const pageEnd = position + sliceH
          for (const s of keepTogether) {
            const sectionFits = (s.bottom - s.top) <= contentBudgetPx
            const wouldBeCut = s.top < pageEnd && s.bottom > pageEnd
            if (sectionFits && wouldBeCut && s.top > position) {
              sliceH = s.top - position
            }
          }
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = headerEndPx + sliceH
          const ctx = pageCanvas.getContext('2d')!
          ctx.drawImage(canvas, 0, 0, canvas.width, headerEndPx, 0, 0, canvas.width, headerEndPx)
          ctx.drawImage(canvas, 0, position, canvas.width, sliceH, 0, headerEndPx, canvas.width, sliceH)
          if (position > headerEndPx) pdf.addPage()
          const destH = pdfW * (pageCanvas.height / canvas.width)
          pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdfW, destH)
          position += sliceH
        }
      }
      const dateSlug = new Date().toISOString().slice(0, 10)
      // Con una selección parcial, el nombre dice qué trae (hasta 2 etiquetas):
      // la categoría si va completa, o sus subcategorías si va solo una parte.
      const etiquetas: string[] = []
      let hayExcluidas = false
      for (const sec of pdfSecciones) {
        const incl = sec.subs.filter(sub => !pdfExcluidas.has(sub.id))
        if (incl.length < sec.subs.length) hayExcluidas = true
        if (incl.length === sec.subs.length) etiquetas.push(sec.key)
        else etiquetas.push(...incl.map(sub => sub.key || sec.key))
      }
      const slugify = (t: string) => t.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const seccionSlug = hayExcluidas && etiquetas.length > 0
        ? etiquetas.length <= 2 ? '_' + etiquetas.map(slugify).join('_') : '_Seleccion'
        : ''
      pdf.save(`Monitor_de_Fondos${seccionSlug}_${dateSlug}.pdf`)
      setShowPdfMenu(false)
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="max-w-[1900px] mx-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Monitor de Fondos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {funds.length} fondos · Última actualización:{' '}
            {/* Intl.DateTimeFormat puede diferir en detalles menores (ej.
                separadores) entre el ICU del server y el del navegador —
                mismo valor, texto potencialmente distinto: no es un bug de
                hidratación real, así que se silencia la advertencia acá. */}
            <span suppressHydrationWarning>{lastUpdate ? new Date(lastUpdate).toLocaleString('es-UY') : '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ISIN…"
            className="w-72 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
          />
          <div className="relative">
            <button
              onClick={() => setShowPdfMenu(v => !v)}
              disabled={downloadingPdf}
              className="text-sm font-medium px-3 py-2 rounded-lg text-[#1B3A2B] border border-[#1B3A2B]/30 whitespace-nowrap disabled:opacity-50"
            >
              {downloadingPdf ? 'Generando…' : '⬇ Descargar PDF ▾'}
            </button>
            {showPdfMenu && !downloadingPdf && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowPdfMenu(false)} />
                <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700">Secciones a descargar</p>
                    <div className="flex gap-2 text-[11px]">
                      <button onClick={() => setPdfExcluidas(new Set())} className="text-[#1B3A2B] hover:underline">Todas</button>
                      <button onClick={() => setPdfExcluidas(new Set(pdfSecciones.flatMap(s => s.subs.map(sub => sub.id))))} className="text-gray-400 hover:underline">Ninguna</button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {pdfSecciones.map(sec => {
                      const incluidas = sec.subs.filter(sub => !pdfExcluidas.has(sub.id)).length
                      const todas = incluidas === sec.subs.length
                      return (
                        <div key={sec.key} className="mb-1">
                          <label className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs font-semibold text-gray-800">
                            <input
                              type="checkbox"
                              checked={todas}
                              ref={el => { if (el) el.indeterminate = incluidas > 0 && !todas }}
                              onChange={() => toggleGrupos(sec.subs.map(sub => sub.id), !todas)}
                              className="accent-[#1B3A2B]"
                            />
                            <span className="flex-1">{sec.key}</span>
                            <span className="text-gray-400 font-normal">{sec.count}</span>
                          </label>
                          {/* Una categoría sin subcategorías no necesita sublista. */}
                          {sec.subs.some(sub => sub.key) && sec.subs.map(sub => (
                            <label key={sub.id} className="flex items-center gap-2 pl-6 pr-1 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={!pdfExcluidas.has(sub.id)}
                                onChange={() => toggleGrupos([sub.id], pdfExcluidas.has(sub.id))}
                                className="accent-[#1B3A2B]"
                              />
                              <span className="flex-1">{sub.key || 'Sin subcategoría'}</span>
                              <span className="text-gray-400">{sub.count}</span>
                            </label>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={pdfFunds.length === 0}
                    className="mt-3 w-full text-sm font-medium px-3 py-2 rounded-lg text-white disabled:opacity-40"
                    style={{ backgroundColor: '#1B3A2B' }}
                  >
                    Descargar ({pdfFunds.length} fondos)
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm font-medium px-3 py-2 rounded-lg text-white whitespace-nowrap"
            style={{ backgroundColor: '#1B3A2B' }}
          >
            + Agregar fondo
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="mb-4 flex items-start justify-between gap-3 text-sm px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <span>{syncNotice}</span>
          <button onClick={() => setSyncNotice(null)} className="text-amber-600 hover:text-amber-800 leading-none">✕</button>
        </div>
      )}

      <div style={{ position: 'fixed', left: -10000, top: 0 }}>
        <div ref={pdfRef}>
          <FondosMonitorPdfTemplate funds={pdfFunds} />
        </div>
      </div>

      {showAdd && (
        <AddFundModal
          categoriasDisponibles={categoriasDisponibles}
          subcategoriasPorCategoria={subcategoriasPorCategoria}
          onClose={() => setShowAdd(false)}
          onCreated={sync => {
            setShowAdd(false)
            setSyncNotice(syncNoticeFor(sync))
            router.refresh()
          }}
        />
      )}

      {editingFund && (
        <EditFundModal
          fund={editingFund}
          categoriasDisponibles={categoriasDisponibles}
          subcategoriasPorCategoria={subcategoriasPorCategoria}
          onClose={() => setEditingFund(null)}
          onSaved={sync => {
            setEditingFund(null)
            setSyncNotice(syncNoticeFor(sync))
            router.refresh()
          }}
          onDeactivated={() => {
            setEditingFund(null)
            router.refresh()
          }}
        />
      )}

      {/*
        El encabezado de columnas (período de cada rendimiento) queda fijo
        con position:sticky. Para que eso funcione tiene que anclarse al
        contenedor que de verdad hace scroll — por eso todas las categorías
        viven en ESTE único panel con overflow-auto, en vez de que cada
        categoría tenga su propio overflow-x-auto: un ancestro con overflow
        distinto de "visible" más cercano al sticky "atrapa" el anclaje, y
        antes (con un overflow-x-auto por tabla) el header nunca llegaba a
        quedar fijo respecto de la página.
      */}
      <div className="h-[calc(100vh-170px)] overflow-auto rounded-xl border border-gray-200">
        {grouped.map(({ key: categoria, items: catRows }, catIdx) => {
          const subgroups = groupInOrder(catRows, f => f.subcategoria ?? '')
          return (
            <div key={categoria} className={catIdx > 0 ? 'mt-6 pt-6 border-t-4 border-gray-100' : ''}>
              <p className="text-xs font-bold text-[#1B3A2B] uppercase tracking-wide mb-2 px-3">{categoria}</p>
              <table className="w-full text-sm min-w-[1100px] table-fixed">
                <thead>
                  <tr className="sticky top-0 z-10" style={{ backgroundColor: '#1B2E3C' }}>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-white uppercase tracking-wide w-[26%]">Nombre</th>
                    {COLS.map(c => (
                      <th key={c.key} className="px-2 py-2 text-center text-[10px] font-bold text-white uppercase tracking-wide w-[7.4%]">{c.label}</th>
                    ))}
                    <th className="px-2 py-2 text-center text-[10px] font-bold text-white uppercase tracking-wide w-[7.4%]">Estado</th>
                  </tr>
                </thead>
                {subgroups.map(({ key: subcategoria, items: rows }) => (
                  <tbody key={subcategoria || '_'}>
                    {subcategoria && (
                      <tr>
                        <td colSpan={COLS.length + 2} className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wide bg-[#2E7D52]">
                          {subcategoria}
                        </td>
                      </tr>
                    )}
                    {rows.map((f, i) => {
                      const st = STATUS_LABEL[f.status ?? 'no_source']
                      return (
                        <tr key={f.id} className={`group ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`} title={f.error_message ?? undefined}>
                          <td className="px-3 py-2 border-b border-gray-100">
                            <div className="flex items-center gap-1.5">
                              <div className="font-medium text-gray-800 text-xs">{f.nombre}</div>
                              <button
                                onClick={() => setEditingFund(f)}
                                title="Editar fondo"
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-[#1B3A2B] transition-opacity"
                              >
                                ✏️
                              </button>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {f.isin} · {f.moneda ?? '—'}
                              {f.as_of_date && ` · datos al ${fmtDate(f.as_of_date)}`}
                            </div>
                          </td>
                          {COLS.map(c => (
                            <td key={c.key} className={`px-2 py-2 text-center text-xs tabular-nums border-b border-gray-100 ${pctColor(f[c.key] as number | null)}`}>
                              {fmtPct(f[c.key] as number | null)}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center border-b border-gray-100">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${st.color}`}>{st.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const OTRA = '__otra__'

// Resultado de la búsqueda inmediata en Davinci que hace el servidor al
// agregar/editar un fondo. 'ok' (o ausente) no necesita aviso.
function syncNoticeFor(sync: string | undefined): string | null {
  if (sync === 'no_source') return 'El fondo se guardó, pero no aparece en Davinci ni por ISIN ni por nombre: quedó sin rendimientos. Revisá que el nombre sea igual al de Davinci.'
  if (sync === 'error') return 'El fondo se guardó, pero no se pudieron traer los rendimientos de Davinci. Se reintenta en la próxima actualización diaria.'
  if (sync === 'unavailable') return 'El fondo se guardó, pero Davinci no está configurado en este ambiente: quedó sin rendimientos.'
  return null
}

function AddFundModal({
  categoriasDisponibles,
  subcategoriasPorCategoria,
  onClose,
  onCreated,
}: {
  categoriasDisponibles: string[]
  subcategoriasPorCategoria: Map<string, string[]>
  onClose: () => void
  onCreated: (sync?: string) => void
}) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState(categoriasDisponibles[0] ?? '')
  const [categoriaOtra, setCategoriaOtra] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [subcategoriaOtra, setSubcategoriaOtra] = useState('')
  const [isin, setIsin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subOptions = subcategoriasPorCategoria.get(categoria) ?? []
  const categoriaFinal = categoria === OTRA ? categoriaOtra.trim() : categoria
  const subcategoriaFinal = subcategoria === OTRA ? subcategoriaOtra.trim() : subcategoria

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !categoriaFinal || !isin.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/fund-monitor/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria: categoriaFinal,
          subcategoria: subcategoriaFinal || null,
          isin: isin.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo agregar el fondo')
      onCreated(data.sync)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
      >
        <h2 className="text-sm font-bold text-gray-900 mb-4">Agregar fondo</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Nombre del fondo</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Categoría general</label>
            <select
              value={categoria}
              onChange={e => { setCategoria(e.target.value); setSubcategoria('') }}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              {categoriasDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {categoria === OTRA && (
              <input
                value={categoriaOtra}
                onChange={e => setCategoriaOtra(e.target.value)}
                placeholder="Nombre de la categoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Subcategoría (opcional)</label>
            <select
              value={subcategoria}
              onChange={e => setSubcategoria(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              <option value="">(sin subcategoría)</option>
              {subOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {subcategoria === OTRA && (
              <input
                value={subcategoriaOtra}
                onChange={e => setSubcategoriaOtra(e.target.value)}
                placeholder="Nombre de la subcategoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">ISIN</label>
            <input
              value={isin}
              onChange={e => setIsin(e.target.value.toUpperCase())}
              placeholder="Ej: LU0154237225"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 font-mono"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !nombre.trim() || !categoriaFinal || !isin.trim()}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#1B3A2B' }}
          >
            {saving ? 'Buscando en Davinci…' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditFundModal({
  fund,
  categoriasDisponibles,
  subcategoriasPorCategoria,
  onClose,
  onSaved,
  onDeactivated,
}: {
  fund: FundRow
  categoriasDisponibles: string[]
  subcategoriasPorCategoria: Map<string, string[]>
  onClose: () => void
  onSaved: (sync?: string) => void
  onDeactivated: () => void
}) {
  const [nombre, setNombre] = useState(fund.nombre)
  const [categoria, setCategoria] = useState(
    fund.categoria && categoriasDisponibles.includes(fund.categoria) ? fund.categoria : OTRA
  )
  const [categoriaOtra, setCategoriaOtra] = useState(
    fund.categoria && !categoriasDisponibles.includes(fund.categoria) ? fund.categoria : ''
  )
  const [subcategoria, setSubcategoria] = useState(fund.subcategoria ?? '')
  const [subcategoriaOtra, setSubcategoriaOtra] = useState('')
  const [isin, setIsin] = useState(fund.isin)
  const [moneda, setMoneda] = useState(fund.moneda ?? '')
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subOptions = subcategoriasPorCategoria.get(categoria) ?? []
  const categoriaFinal = categoria === OTRA ? categoriaOtra.trim() : categoria
  const subcategoriaFinal = subcategoria === OTRA ? subcategoriaOtra.trim() : subcategoria

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !categoriaFinal || !isin.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/fund-monitor/funds/${fund.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria: categoriaFinal,
          subcategoria: subcategoriaFinal || null,
          isin: isin.trim(),
          moneda: moneda.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el fondo')
      onSaved(data.sync)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!confirm(`¿Quitar "${fund.nombre}" del monitor? Podés volver a agregarlo más adelante.`)) return
    setDeactivating(true)
    setError(null)
    try {
      const res = await fetch(`/api/fund-monitor/funds/${fund.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'No se pudo quitar el fondo')
      }
      onDeactivated()
    } catch (err: any) {
      setError(err.message)
      setDeactivating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
      >
        <h2 className="text-sm font-bold text-gray-900 mb-4">Editar fondo</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Nombre del fondo</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Categoría general</label>
            <select
              value={categoria}
              onChange={e => { setCategoria(e.target.value); setSubcategoria('') }}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              {categoriasDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {categoria === OTRA && (
              <input
                value={categoriaOtra}
                onChange={e => setCategoriaOtra(e.target.value)}
                placeholder="Nombre de la categoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Subcategoría (opcional)</label>
            <select
              value={subcategoria}
              onChange={e => setSubcategoria(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 bg-white"
            >
              <option value="">(sin subcategoría)</option>
              {subOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value={OTRA}>Otra (nueva)…</option>
            </select>
            {subcategoria === OTRA && (
              <input
                value={subcategoriaOtra}
                onChange={e => setSubcategoriaOtra(e.target.value)}
                placeholder="Nombre de la subcategoría nueva"
                className="w-full mt-2 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">ISIN</label>
              <input
                value={isin}
                onChange={e => setIsin(e.target.value.toUpperCase())}
                placeholder="Ej: LU0154237225"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Moneda</label>
              <input
                value={moneda}
                onChange={e => setMoneda(e.target.value.toUpperCase())}
                placeholder="Ej: USD"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#1B3A2B]/50 font-mono"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={deactivating || saving}
            className="text-xs font-medium px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            {deactivating ? 'Quitando…' : 'Quitar del monitor'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || deactivating || !nombre.trim() || !categoriaFinal || !isin.trim()}
              className="text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#1B3A2B' }}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
