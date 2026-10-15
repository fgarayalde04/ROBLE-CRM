'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ETIQUETA_FUENTE, armarReporte, bonosIncompletos, categoriaMovimiento, claveArchivo, clavePosicion, cuentasDe, ddmmyyyy, fechaSugerida, fmt, fmtPct, mesCorto,
  type Archivos, type LineaPosicion, type Reporte,
} from '@/lib/consolidado/calc'
import { BANCOS, CLASES, TIPOS_ARCHIVO, type ArchivoLeido, type Banco, type Terminos } from '@/lib/consolidado/types'
import type { ConsolidadoRow, DatosConsolidado } from '@/lib/db/consolidados'

const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const COLOR_BANCO: Record<Banco, string> = {
  Pershing: 'bg-sky-50 text-sky-800 border-sky-200',
  'Morgan Stanley': 'bg-teal-50 text-teal-800 border-teal-200',
}

function EtiquetaBanco({ banco }: { banco: Banco }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-semibold ${COLOR_BANCO[banco]}`}>
      {banco === 'Pershing' ? 'Pershing' : 'Morgan'}
    </span>
  )
}

const MARCA_FUENTE: Record<string, string> = { tasa: '≈', 'sin datos': '!', manual: '✎' }

export default function ConsolidadoClient({ guardado, historial }: {
  guardado: { id: string; cliente: string; datos: DatosConsolidado } | null
  historial: ConsolidadoRow[]
}) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<Archivos>(guardado?.datos.archivos ?? {})
  const [errores, setErrores] = useState<string[]>([])
  const [cargando, setCargando] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const [cliente, setCliente] = useState(guardado?.cliente ?? '')
  const [fechaManual, setFechaManual] = useState<string | null>(guardado?.datos.fechaManual ?? null)
  const [manuales, setManuales] = useState<Record<string, number>>(guardado?.datos.manuales ?? {})
  const [externos, setExternos] = useState<Record<string, Terminos>>(guardado?.datos.externos ?? {})
  const [incluirMovimientos, setIncluirMovimientos] = useState(guardado?.datos.incluirMovimientos ?? true)
  const [savedId, setSavedId] = useState<string | null>(guardado?.id ?? null)
  const [exportando, setExportando] = useState<'excel' | 'pdf' | 'guardar' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fecha = fechaManual ?? fechaSugerida(archivos) ?? hoyIso()
  const cuentas = useMemo(() => cuentasDe(archivos), [archivos])
  const cuentasTexto = cuentas.map((c) => `${c.banco} ${c.cuenta}`).join(' · ')
  const reporte = useMemo(
    () => (Object.keys(archivos).length ? armarReporte(archivos, fecha, new Set(), manuales, externos) : null),
    [archivos, fecha, manuales, externos],
  )

  // "Abrir" otro consolidado del historial (cambia ?id=) lo carga en pantalla.
  useEffect(() => {
    if (!guardado || guardado.id === savedId) return
    setArchivos(guardado.datos.archivos)
    setCliente(guardado.cliente)
    setFechaManual(guardado.datos.fechaManual ?? null)
    setManuales(guardado.datos.manuales ?? {})
    setExternos(guardado.datos.externos ?? {})
    setIncluirMovimientos(guardado.datos.incluirMovimientos ?? true)
    setSavedId(guardado.id)
    setErrores([])
    setAviso(null)
    window.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardado?.id])

  // Bonos sin cupón o vencimiento en ningún archivo: se completan con OpenFIGI.
  const faltantes = useMemo(() => bonosIncompletos(archivos).filter((c) => !(c in externos)), [archivos, externos])
  useEffect(() => {
    if (!faltantes.length) return
    let vivo = true
    fetch('/api/consolidado/bonos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cusips: faltantes }) })
      .then((r) => (r.ok ? r.json() : { terminos: {} }))
      .then((d) => {
        if (!vivo) return
        // Los que no aparecen quedan marcados para no volver a pedirlos.
        const vacios = Object.fromEntries(faltantes.map((c) => [c, { tasa: null, vencimiento: null } as Terminos]))
        setExternos((prev) => ({ ...vacios, ...prev, ...(d.terminos ?? {}) }))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [faltantes])

  async function guardar(silencioso = false): Promise<string | null> {
    if (!reporte) return null
    if (!cliente.trim()) {
      setAviso('Poné el nombre del cliente para guardarlo.')
      return null
    }
    const datos: DatosConsolidado = { archivos, fechaManual, manuales, externos, incluirMovimientos }
    const res = await fetch('/api/consolidado/guardados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: savedId, clientName: cliente.trim(), cuentas: cuentasTexto, fecha, datos }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setAviso(data.error ?? 'No se pudo guardar.')
      return null
    }
    setSavedId(data.id)
    if (!silencioso) setAviso('Guardado. Lo encontrás abajo, en Consolidados guardados.')
    router.replace(`/factsheet/consolidado?id=${data.id}`, { scroll: false })
    router.refresh()
    return data.id
  }

  async function descargarPdf() {
    if (!reporte) return
    setExportando('pdf')
    setAviso(null)
    try {
      const res = await fetch('/api/consolidado/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: cliente.trim(), fecha, datos: { archivos, fechaManual, manuales, externos, incluirMovimientos } }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setAviso(d.error ?? 'No se pudo generar el PDF.')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `Posicion consolidada${cliente.trim() ? ` - ${cliente.trim()}` : ''} ${reporte.fecha}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      if (cliente.trim()) await guardar(true)
    } finally {
      setExportando(null)
    }
  }

  async function subir(files: FileList | File[]) {
    const lista = Array.from(files)
    if (!lista.length) return
    setErrores([])
    setCargando((n) => n + lista.length)
    const nuevos: string[] = []
    await Promise.all(
      lista.map(async (file) => {
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/consolidado/leer', { method: 'POST', body: fd })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error ?? `${file.name}: no se pudo leer`)
          const a = data.archivo as ArchivoLeido
          setArchivos((prev) => ({ ...prev, [claveArchivo(a.banco, a.tipo)]: a }))
        } catch (e: any) {
          nuevos.push(e.message)
        } finally {
          setCargando((n) => n - 1)
        }
      }),
    )
    if (nuevos.length) setErrores(nuevos)
  }

  function quitar(banco: Banco, tipo: string) {
    setArchivos((prev) => {
      const next = { ...prev }
      delete next[`${banco}|${tipo}` as keyof Archivos]
      return next
    })
  }

  async function descargarExcel() {
    if (!reporte) return
    setExportando('excel')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const n = (v: number | null | undefined) => (v == null ? '' : Math.round(v * 100) / 100)

      const resumen: (string | number)[][] = [
        ['Posición Consolidada'], ['Cliente', cliente || '—'], ['Valuación al', ddmmyyyy(reporte.fecha)], [],
        ['Banco', 'Valor de mercado', 'Cupón corrido', 'Total', '% del total'],
        ...reporte.porBanco.map((b) => [b.banco, n(b.valorMercado), n(b.cuponCorrido), n(b.total), n(b.peso * 100)]),
        ['Total', n(reporte.totales.valorMercado), n(reporte.totales.cuponCorrido), n(reporte.totales.total), 100], [],
        ['Clase de activo', 'Valor de mercado', 'Cupón corrido', 'Total', '% del total'],
        ...reporte.porClase.map((c) => [c.clase, n(c.valorMercado), n(c.cuponCorrido), n(c.total), n(c.peso * 100)]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Banco', 'Cuenta', 'Clase', 'Instrumento', 'CUSIP', 'Cantidad', 'Precio', 'Costo', 'Valor de mercado', 'Cupón corrido', 'Origen cupón corrido', 'Total', 'Resultado', '% del total'],
        ...reporte.posiciones.map((l) => [
          l.banco, l.cuenta ?? '', l.clase, l.descripcion, l.cusip ?? '', n(l.cantidad), n(l.precio), n(l.costo), n(l.valorMercado),
          n(l.cuponCorrido), l.fuenteCorrido ? ETIQUETA_FUENTE[l.fuenteCorrido] : '', n(l.total), n(l.resultado), n(l.peso * 100),
        ]),
      ]), 'Posiciones')

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Banco', 'Tipo', 'Instrumento', 'CUSIP', ...reporte.renta.meses.map(mesCorto), 'Total'],
        ...reporte.renta.filas.map((f) => [f.banco, f.clase, f.descripcion, f.cusip ?? '', ...f.montos.map(n), n(f.total)]),
        ['Total', '', '', '', ...reporte.renta.montos.map(n), n(reporte.renta.total)],
      ]), 'Renta 12 meses')

      if (reporte.movimientos.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ['Fecha', 'Banco', 'Cuenta', 'Categoría', 'Tipo', 'Descripción', 'CUSIP', 'Cantidad', 'Precio', 'Monto'],
          ...reporte.movimientos.map((m) => [
            ddmmyyyy(m.fecha), m.banco, m.cuenta ?? '', categoriaMovimiento(m), m.tipo, m.descripcion, m.cusip ?? '', n(m.cantidad), n(m.precio), n(m.monto),
          ]),
        ]), 'Movimientos')
      }
      XLSX.writeFile(wb, `Posicion consolidada${cliente ? ` - ${cliente}` : ''} ${reporte.fecha}.xlsx`)
      if (cliente.trim()) await guardar(true)
    } finally {
      setExportando(null)
    }
  }

  const hayArchivos = Object.keys(archivos).length > 0

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden; }
          #reporte-consolidado, #reporte-consolidado * { visibility: visible; }
          #reporte-consolidado { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          #reporte-consolidado section { break-inside: auto; }
          #reporte-consolidado tr { break-inside: avoid; }
          #reporte-consolidado thead { display: table-header-group; }
          #reporte-consolidado * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Carga ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 print:hidden">
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${arrastrando ? 'border-[#2D3F52] bg-slate-50' : 'border-gray-200 hover:border-gray-300'}`}
        >
          <p className="text-sm font-medium text-gray-700">{cargando ? `Leyendo ${cargando} archivo(s)…` : 'Arrastrá acá los Excel de los bancos, o hacé clic para elegirlos'}</p>
          <p className="mt-1 text-xs text-gray-400">Podés soltar todos juntos: cada archivo se reconoce solo (banco y tipo de reporte).</p>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => { if (e.target.files) subir(e.target.files); e.target.value = '' }} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {BANCOS.map((banco) => (
            <div key={banco} className="rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <EtiquetaBanco banco={banco} />
                <span className="text-sm font-semibold text-gray-800">{banco}</span>
              </div>
              <ul className="divide-y divide-gray-50">
                {TIPOS_ARCHIVO.map((t) => {
                  const a = archivos[claveArchivo(banco, t.tipo)]
                  return (
                    <li key={t.tipo} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${a ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{a ? '✓' : ''}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-800">{t.label} <span className="text-xs text-gray-400">({banco === 'Pershing' ? t.pershing : t.morgan})</span></p>
                        {a ? (
                          <p className="truncate text-xs text-gray-500">
                            {a.nombre}
                            {a.fecha ? ` · al ${ddmmyyyy(a.fecha)}` : ''}
                            {a.tipo === 'posiciones' ? ` · ${a.posiciones.length} posiciones` : a.tipo === 'movimientos' ? ` · ${a.movimientos.length} movimientos` : ` · ${a.pagos.length} pagos`}
                          </p>
                        ) : <p className="text-xs text-gray-400">Opcional</p>}
                      </div>
                      {a && <button onClick={() => quitar(banco, t.tipo)} className="text-xs text-gray-400 hover:text-red-600">Quitar</button>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {errores.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errores.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
      </div>

      {/* ── Opciones ──────────────────────────────────────────────────── */}
      {hayArchivos && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 print:hidden">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="text-xs text-gray-500">Cliente (título del reporte)</span>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente"
                className="mt-1 block w-64 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-[#2D3F52] focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Valuación al</span>
              <input type="date" value={fecha} onChange={(e) => setFechaManual(e.target.value || null)}
                className="mt-1 block rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-[#2D3F52] focus:outline-none" />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={incluirMovimientos} onChange={(e) => setIncluirMovimientos(e.target.checked)} />
              Incluir movimientos en el PDF
            </label>
            <div className="ml-auto flex gap-2">
              <button onClick={async () => { setExportando('guardar'); setAviso(null); try { await guardar() } finally { setExportando(null) } }} disabled={!reporte || !!exportando}
                className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {exportando === 'guardar' ? 'Guardando…' : savedId ? 'Guardar cambios' : 'Guardar'}
              </button>
              <button onClick={descargarExcel} disabled={!reporte || !!exportando}
                className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {exportando === 'excel' ? 'Generando…' : 'Descargar Excel'}
              </button>
              <button onClick={descargarPdf} disabled={!reporte || !!exportando}
                className="rounded bg-[#2D3F52] px-3 py-1.5 text-sm text-white hover:bg-[#23323f] disabled:opacity-50">
                {exportando === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
              </button>
            </div>
          </div>
          {aviso && <p className="mt-3 text-xs text-[#2D3F52]">{aviso}</p>}
          {savedId && (
            <p className="mt-2 text-[11px] text-gray-400">
              Consolidado guardado: los cambios se guardan con “Guardar cambios” o al descargar.{' '}
              <a href="/factsheet/consolidado" className="underline hover:text-gray-600">Empezar uno nuevo</a>
            </p>
          )}

        </div>
      )}

      {reporte && (
        <VistaReporte
          r={reporte}
          cliente={cliente}
          cuentas={cuentasTexto}
          manuales={manuales}
          setManual={(clave, v) => setManuales((prev) => {
            const next = { ...prev }
            if (v == null) delete next[clave]
            else next[clave] = v
            return next
          })}
        />
      )}

      <Historial historial={historial} actual={savedId} />
    </div>
  )
}

function Historial({ historial, actual }: { historial: ConsolidadoRow[]; actual: string | null }) {
  const router = useRouter()
  const [borrando, setBorrando] = useState<string | null>(null)
  if (!historial.length) return null

  async function borrar(h: ConsolidadoRow) {
    if (!confirm(`¿Borrar el consolidado de ${h.client_name} al ${ddmmyyyy(h.valuation_date)}?`)) return
    setBorrando(h.id)
    try {
      const res = await fetch(`/api/consolidado/guardados/${h.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) alert(d.error ?? 'No se pudo borrar')
      if (h.id === actual) window.location.href = '/factsheet/consolidado'
      else router.refresh()
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 print:hidden">
      <h2 className="text-sm font-semibold text-gray-800">Consolidados guardados</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-2 py-1.5">Cliente</th><th className="px-2 py-1.5">Cuentas</th><th className="px-2 py-1.5">Valuación</th>
              <th className="px-2 py-1.5 text-right">Total</th><th className="px-2 py-1.5 text-right">Cupón corrido</th>
              <th className="px-2 py-1.5">Guardado por</th><th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id} className={`border-b border-gray-50 ${h.id === actual ? 'bg-slate-50' : ''}`}>
                <td className="px-2 py-1.5 font-medium text-gray-800">{h.client_name}</td>
                <td className="px-2 py-1.5 text-xs text-gray-500">{h.cuentas || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{ddmmyyyy(h.valuation_date)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(h.total_value)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(h.accrued_interest)}</td>
                <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{h.created_by ?? '—'} · {new Date(h.updated_at).toLocaleDateString('es-UY')}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-right">
                  {h.id === actual ? <span className="text-xs text-gray-400">abierto</span> : (
                    <Link href={`/factsheet/consolidado?id=${h.id}`} className="text-xs text-[#2D3F52] underline">Abrir</Link>
                  )}
                  <button onClick={() => borrar(h)} disabled={borrando === h.id} className="ml-3 text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">
                    {borrando === h.id ? 'Borrando…' : 'Borrar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Reporte ────────────────────────────────────────────────────────────────

const th = 'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500'
const td = 'px-2 py-1.5 align-top'
const num = `${td} text-right tabular-nums whitespace-nowrap`

function Seccion({ titulo, children, nota }: { titulo: string; children: ReactNode; nota?: string }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b-2 border-[#2D3F52] pb-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#2D3F52]">{titulo}</h3>
        {nota && <span className="text-[11px] text-gray-400">{nota}</span>}
      </div>
      {children}
    </section>
  )
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{valor}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

const colorResultado = (v: number | null) => (v == null ? '' : v < 0 ? 'text-red-700' : v > 0 ? 'text-emerald-700' : '')

function CeldaCorrido({ l, manual, setManual }: { l: LineaPosicion; manual: number | undefined; setManual: (clave: string, v: number | null) => void }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const clave = clavePosicion(l)
  if (l.clase !== 'Renta fija' && !l.cuponCorrido) return <td className={num}>—</td>

  if (editando) {
    return (
      <td className={num}>
        <input
          autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
          onBlur={() => {
            const v = Number(valor.replace(/,/g, ''))
            setManual(clave, valor.trim() === '' ? null : isFinite(v) ? v : manual ?? null)
            setEditando(false)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditando(false) }}
          className="w-24 rounded border border-gray-300 px-1 py-0.5 text-right text-xs"
          placeholder="vacío = calcular"
        />
      </td>
    )
  }
  const marca = l.fuenteCorrido ? MARCA_FUENTE[l.fuenteCorrido] : undefined
  return (
    <td className={num}>
      <button
        type="button"
        title={`${l.fuenteCorrido ? ETIQUETA_FUENTE[l.fuenteCorrido] : ''} — clic para cargarlo a mano`}
        onClick={() => { setValor(manual != null ? String(manual) : ''); setEditando(true) }}
        className={`tabular-nums hover:underline ${l.fuenteCorrido === 'sin datos' ? 'text-amber-700' : ''}`}
      >
        {fmt(l.cuponCorrido)}
        {marca && <sup className="ml-0.5 text-[9px] text-gray-400">{marca}</sup>}
      </button>
    </td>
  )
}

function VistaReporte({ r, cliente, cuentas, manuales, setManual }: {
  r: Reporte
  cliente: string
  cuentas: string
  manuales: Record<string, number>
  setManual: (clave: string, v: number | null) => void
}) {
  const t = r.totales
  const bancosTexto = r.bancos.join(' + ')
  const fuentes = new Set(r.posiciones.map((p) => p.fuenteCorrido).filter(Boolean))
  const columnas = 10
  // Los barridos automáticos al money market llenan la lista: van solo en el resumen.
  const detalle = r.movimientos.filter((m) => categoriaMovimiento(m) !== 'Money market')
  const ocultos = r.movimientos.length - detalle.length

  return (
    <div id="reporte-consolidado" className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-800">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Roble Capital · Posición Consolidada</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#2D3F52]">{cliente || 'Posición Consolidada'}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{cuentas || bancosTexto || '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Valuación al</p>
          <p className="text-lg font-semibold text-gray-900">{ddmmyyyy(r.fecha)}</p>
        </div>
      </div>

      {/* KPIs */}
      {r.posiciones.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Valor de mercado" valor={`USD ${fmt(t.valorMercado)}`} />
          <Kpi label="Cupón corrido" valor={`USD ${fmt(t.cuponCorrido)}`} sub="intereses devengados no cobrados" />
          <Kpi label="Total de la cuenta" valor={`USD ${fmt(t.total)}`} sub="valor de mercado + cupón corrido" />
          <Kpi label="Resultado no realizado" valor={`USD ${fmt(t.resultado)}`} sub={t.costo ? `${fmtPct(t.resultado / t.costo, 2)} sobre costo` : undefined} />
          <Kpi label="Renta próximos 12 meses" valor={r.renta.filas.length ? `USD ${fmt(r.renta.total)}` : '—'} sub={r.renta.filas.length ? 'cupones y dividendos proyectados' : 'sin calendario de cupones'} />
        </div>
      )}

      {/* Por banco y por clase */}
      {r.posiciones.length > 0 && (
        <div className="grid gap-8 md:grid-cols-2">
          <Seccion titulo="Por banco">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200">
                <th className={`${th} text-left`}>Banco</th><th className={`${th} text-right`}>Valor mercado</th>
                <th className={`${th} text-right`}>Cupón corrido</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>%</th>
              </tr></thead>
              <tbody>
                {r.porBanco.map((b) => (
                  <tr key={b.banco} className="border-b border-gray-50">
                    <td className={td}><EtiquetaBanco banco={b.banco} /> <span className="ml-1">{b.banco}</span></td>
                    <td className={num}>{fmt(b.valorMercado)}</td><td className={num}>{fmt(b.cuponCorrido)}</td>
                    <td className={`${num} font-medium`}>{fmt(b.total)}</td><td className={num}>{fmtPct(b.peso)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className={td}>Total</td><td className={num}>{fmt(t.valorMercado)}</td><td className={num}>{fmt(t.cuponCorrido)}</td>
                  <td className={num}>{fmt(t.total)}</td><td className={num}>100.0%</td>
                </tr>
              </tbody>
            </table>
          </Seccion>
          <Seccion titulo="Por clase de activo">
            <table className="w-full">
              <tbody>
                {r.porClase.map((c) => (
                  <tr key={c.clase} className="border-b border-gray-50">
                    <td className={`${td} w-28`}>{c.clase}</td>
                    <td className={td}>
                      <div className="mt-1 h-2.5 rounded bg-gray-100">
                        <div className="h-2.5 rounded bg-[#2D3F52]" style={{ width: `${Math.max(1, c.peso * 100)}%` }} />
                      </div>
                    </td>
                    <td className={num}>{fmt(c.total)}</td>
                    <td className={`${num} w-16`}>{fmtPct(c.peso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>
        </div>
      )}

      {/* Posiciones */}
      {r.posiciones.length > 0 && (
        <Seccion titulo="Posiciones" nota="Importes en USD · el total incluye el cupón corrido">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200">
                <th className={`${th} text-left`}>Banco</th>
                <th className={`${th} text-left`}>Instrumento</th>
                <th className={`${th} text-right`}>Cantidad</th><th className={`${th} text-right`}>Precio</th>
                <th className={`${th} text-right`}>Costo</th><th className={`${th} text-right`}>Valor mercado</th>
                <th className={`${th} text-right`}>Cupón corrido</th><th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Resultado</th><th className={`${th} text-right`}>%</th>
              </tr></thead>
              <tbody>
                {CLASES.map((clase) => {
                  const ls = r.posiciones.filter((l) => l.clase === clase)
                  if (!ls.length) return null
                  const s = r.porClase.find((c) => c.clase === clase)!
                  return (
                    <Fragment key={clase}>
                      <tr className="bg-slate-50">
                        <td colSpan={columnas} className="px-2 py-1.5 text-xs font-semibold text-[#2D3F52]">{clase}</td>
                      </tr>
                      {ls.map((l) => (
                        <tr key={clavePosicion(l)} className="border-b border-gray-50">
                          <td className={td}><EtiquetaBanco banco={l.banco} /></td>
                          <td className={td}>
                            <p className="font-medium text-gray-800" title={l.descripcion}>{l.nombre}</p>
                            <p className="text-[10px] text-gray-400">{[l.detalle, l.categoria].filter(Boolean).join(' · ')}</p>
                          </td>
                          <td className={num}>{l.clase === 'Efectivo' ? '' : fmt(l.cantidad, l.cantidad != null && !Number.isInteger(l.cantidad) ? 3 : 0)}</td>
                          <td className={num}>{l.precio == null ? '' : fmt(l.precio, 3)}</td>
                          <td className={num}>{fmt(l.costo)}</td>
                          <td className={num}>{fmt(l.valorMercado)}</td>
                          <CeldaCorrido l={l} manual={manuales[clavePosicion(l)]} setManual={setManual} />
                          <td className={`${num} font-medium`}>{fmt(l.total)}</td>
                          <td className={`${num} ${colorResultado(l.resultado)}`}>
                            {fmt(l.resultado)}
                            {l.resultado != null && l.costo ? <p className="text-[10px]">{fmtPct(l.resultado / l.costo, 2)}</p> : null}
                          </td>
                          <td className={num}>{fmtPct(l.peso)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-gray-200 font-semibold">
                        <td colSpan={4} className={`${td} text-right text-gray-500`}>Subtotal {clase.toLowerCase()}</td>
                        <td className={num}>{fmt(s.costo)}</td><td className={num}>{fmt(s.valorMercado)}</td><td className={num}>{fmt(s.cuponCorrido)}</td>
                        <td className={num}>{fmt(s.total)}</td><td className={`${num} ${colorResultado(s.resultado)}`}>{fmt(s.resultado)}</td><td className={num}>{fmtPct(s.peso)}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="border-t-2 border-gray-400 text-sm font-semibold">
                  <td colSpan={4} className={`${td} text-right`}>Total</td>
                  <td className={num}>{fmt(t.costo)}</td><td className={num}>{fmt(t.valorMercado)}</td><td className={num}>{fmt(t.cuponCorrido)}</td>
                  <td className={num}>{fmt(t.total)}</td><td className={`${num} ${colorResultado(t.resultado)}`}>{fmt(t.resultado)}</td><td className={num}>100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
          {fuentes.size > 0 && (
            <p className="mt-2 text-[10px] text-gray-400">
              Cupón corrido: calculado al {ddmmyyyy(r.fecha)} con el cupón del próximo pago × días transcurridos desde el último (base 30/360).
              {fuentes.has('tasa') && ' ≈ estimado con tasa y vencimiento (pago semestral).'}
              {fuentes.has('sin datos') && ' ! sin datos para calcularlo.'}
              {fuentes.has('manual') && ' ✎ cargado a mano.'}
              <span className="print:hidden"> Hacé clic en un importe para corregirlo.</span>
            </p>
          )}
        </Seccion>
      )}

      {/* Renta */}
      {r.renta.filas.length > 0 && (
        <Seccion titulo="Renta proyectada · próximos 12 meses" nota={`Cupones USD ${fmt(r.renta.cupones)} · Dividendos USD ${fmt(r.renta.dividendos)}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200">
                <th className={`${th} text-left`}>Banco</th><th className={`${th} text-left`}>Instrumento</th>
                {r.renta.meses.map((m) => <th key={m} className={`${th} text-right`}>{mesCorto(m)}</th>)}
                <th className={`${th} text-right`}>Total</th>
              </tr></thead>
              <tbody>
                {r.renta.filas.map((f, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className={td}><EtiquetaBanco banco={f.banco} /></td>
                    <td className={td}>
                      <p className="max-w-[260px] truncate" title={f.descripcion}>{f.descripcion}</p>
                      <p className="text-[10px] text-gray-400">{f.clase}{f.cusip ? ` · ${f.cusip}` : ''}</p>
                    </td>
                    {f.montos.map((v, j) => <td key={j} className={num}>{v ? fmt(v, 0) : ''}</td>)}
                    <td className={`${num} font-medium`}>{fmt(f.total, 0)}</td>
                  </tr>
                ))}
                {r.renta.porBanco.length > 1 && r.renta.porBanco.map((b) => (
                  <tr key={b.banco} className="text-gray-600">
                    <td className={td}><EtiquetaBanco banco={b.banco} /></td><td className={td}>Subtotal {b.banco}</td>
                    {b.montos.map((v, j) => <td key={j} className={num}>{v ? fmt(v, 0) : ''}</td>)}
                    <td className={num}>{fmt(b.total, 0)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-400 font-semibold">
                  <td className={td} colSpan={2}>Total</td>
                  {r.renta.montos.map((v, j) => <td key={j} className={num}>{v ? fmt(v, 0) : ''}</td>)}
                  <td className={num}>{fmt(r.renta.total, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {/* Movimientos */}
      {r.movimientos.length > 0 && (
        <Seccion titulo="Movimientos" nota={`Del ${ddmmyyyy(r.periodoMovimientos.desde)} al ${ddmmyyyy(r.periodoMovimientos.hasta)}`}>
          <div className="mb-4 flex flex-wrap gap-2">
            {r.resumenMovimientos.map((c) => (
              <div key={c.categoria} className="rounded border border-gray-200 px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{c.categoria} · {c.cantidad}</p>
                <p className={`text-sm font-semibold tabular-nums ${colorResultado(c.monto)}`}>{fmt(c.monto)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200">
                <th className={`${th} text-left`}>Fecha</th><th className={`${th} text-left`}>Banco</th>
                <th className={`${th} text-left`}>Tipo</th><th className={`${th} text-left`}>Descripción</th>
                <th className={`${th} text-right`}>Cantidad</th><th className={`${th} text-right`}>Precio</th><th className={`${th} text-right`}>Monto</th>
              </tr></thead>
              <tbody>
                {detalle.map((m, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className={`${td} whitespace-nowrap`}>{ddmmyyyy(m.fecha)}</td>
                    <td className={td}><EtiquetaBanco banco={m.banco} /></td>
                    <td className={td}>{m.tipo}</td>
                    <td className={td}><p className="max-w-[420px]">{m.descripcion}</p></td>
                    <td className={num}>{m.cantidad == null ? '' : fmt(m.cantidad, Number.isInteger(m.cantidad) ? 0 : 3)}</td>
                    <td className={num}>{m.precio == null ? '' : fmt(m.precio, 3)}</td>
                    <td className={`${num} ${colorResultado(m.monto)}`}>{fmt(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ocultos > 0 && (
            <p className="mt-2 text-[10px] text-gray-400">
              No se muestran en el detalle {ocultos} movimientos de money market (compras y rescates automáticos del fondo de liquidez); están sumados en el resumen y en el Excel.
            </p>
          )}
        </Seccion>
      )}

      {r.avisos.length > 0 && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 print:hidden">
          <p className="mb-1 font-semibold">Revisar</p>
          <ul className="list-disc space-y-0.5 pl-4">{r.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <p className="mt-8 border-t border-gray-200 pt-3 text-[10px] leading-relaxed text-gray-400">
        Información preparada por Roble Capital a partir de los reportes de {bancosTexto || 'los custodios'}. No es un estado de cuenta oficial: ante diferencias, valen los estados de cuenta de cada banco.
        El cupón corrido es una estimación de los intereses devengados y no cobrados a la fecha de valuación. La renta proyectada es bruta, antes de impuestos, y no incluye amortizaciones ni rescates anticipados.
      </p>
    </div>
  )
}
