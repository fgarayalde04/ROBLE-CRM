'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ETIQUETA_FUENTE, armarReporte, bonosIncompletos, categoriaMovimiento, claveArchivo, clavePosicion, cuentasDe, ddmmyyyy, fechaSugerida, fmt, fmtPct, mesCorto, textoCompras,
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
        ['Banco', 'Cuenta', 'Clase', 'Instrumento', 'CUSIP', 'Cupón %', 'Vencimiento', 'Fechas de compra', 'Cantidad', 'Precio', 'Costo', 'Valor de mercado', 'Cupón corrido', 'Origen cupón corrido', 'Total', 'Resultado', '% del total'],
        ...reporte.posiciones.map((l) => [
          l.banco, l.cuenta ?? '', l.clase, l.nombre, l.cusip ?? '', l.tasa != null ? n(l.tasa * 100) : '',
          l.vencimiento ? ddmmyyyy(l.vencimiento) : l.perpetuo ? 'Perpetuo' : '', (l.fechasCompra ?? []).map(ddmmyyyy).join(', '),
          n(l.cantidad), n(l.precio), n(l.costo), n(l.valorMercado),
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

const COLOR_CLASE: Record<string, string> = {
  Efectivo: '#94A3B8', 'Renta fija': '#1B3A2B', 'Fondos de inversión': '#2E7D52', ETF: '#4CAF72', Acciones: '#1E40AF', Otros: '#9CA3AF',
}
const COLOR_CUSTODIO: Record<Banco, string> = { Pershing: '#0369A1', 'Morgan Stanley': '#0F766E' }

const colorResultado = (v: number | null) => (v == null ? 'text-gray-400' : v < 0 ? 'text-red-600' : v > 0 ? 'text-emerald-700' : 'text-gray-500')
const signo = (v: number) => (v > 0 ? '+' : '')

function Tarjeta({ titulo, children, className = '' }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      {titulo && <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</h3>}
      {children}
    </div>
  )
}

function Kpi({ label, valor, sub, acento }: { label: string; valor: string; sub?: string; acento: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3" style={{ borderTop: `3px solid ${acento}` }}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

function Dona({ datos, centro }: { datos: { label: string; valor: number; color: string }[]; centro: string }) {
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1
  const R = 42, C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0">
      <circle cx="60" cy="60" r={R} fill="none" stroke="#F1F5F9" strokeWidth="16" />
      {datos.map((d) => {
        const largo = (d.valor / total) * C
        const el = (
          <circle key={d.label} cx="60" cy="60" r={R} fill="none" stroke={d.color} strokeWidth="16"
            strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acumulado} transform="rotate(-90 60 60)" />
        )
        acumulado += largo
        return el
      })}
      <text x="60" y="57" textAnchor="middle" fontSize="8" fill="#6B7280">Total</text>
      <text x="60" y="69" textAnchor="middle" fontSize="10" fontWeight="700" fill="#111827">{centro}</text>
    </svg>
  )
}

function Barra({ peso, color }: { peso: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, peso * 100))}%`, background: color }} />
    </div>
  )
}

const compacto = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0)

function GraficoRenta({ meses, montos }: { meses: string[]; montos: number[] }) {
  const max = Math.max(...montos, 1)
  return (
    <div className="flex h-44 items-end gap-1.5">
      {montos.map((v, i) => (
        <div key={meses[i]} className="flex h-full flex-1 flex-col items-center justify-end">
          <span className="mb-1 text-[10px] font-semibold tabular-nums text-gray-700">{v ? compacto(v) : ''}</span>
          <div className="w-full max-w-[42px] rounded-t-md bg-gradient-to-t from-[#1B3A2B] to-[#2E7D52]" style={{ height: `${v ? Math.max(3, (v / max) * 100) : 0}%` }} />
          <span className="mt-1 text-[10px] text-gray-500">{mesCorto(meses[i])}</span>
        </div>
      ))}
    </div>
  )
}

function CorridoEditable({ l, manual, setManual }: { l: LineaPosicion; manual: number | undefined; setManual: (clave: string, v: number | null) => void }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const clave = clavePosicion(l)
  if (l.clase !== 'Renta fija' && !l.cuponCorrido) return <span className="text-gray-300">—</span>
  if (editando) {
    return (
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
    )
  }
  const marca = l.fuenteCorrido ? MARCA_FUENTE[l.fuenteCorrido] : undefined
  return (
    <button
      type="button"
      title={`${l.fuenteCorrido ? ETIQUETA_FUENTE[l.fuenteCorrido] : ''} — clic para cargarlo a mano`}
      onClick={() => { setValor(manual != null ? String(manual) : ''); setEditando(true) }}
      className={`tabular-nums hover:underline ${l.fuenteCorrido === 'sin datos' ? 'text-amber-600' : 'text-amber-700'}`}
    >
      {fmt(l.cuponCorrido)}
      {marca && <sup className="ml-0.5 text-[9px] text-gray-400">{marca}</sup>}
    </button>
  )
}

/** "100,000 nominales a 101.288 · Costo 105,867.73" */
function lineaCantidad(l: LineaPosicion) {
  if (l.clase === 'Efectivo' || l.cantidad == null) return ''
  const cant = fmt(l.cantidad, Number.isInteger(l.cantidad) ? 0 : 3)
  const unidad = l.clase === 'Renta fija' ? 'nominales' : l.cantidad === 1 ? 'cuotaparte' : l.clase === 'Fondos de inversión' ? 'cuotapartes' : 'acciones'
  return [`${cant} ${unidad}${l.precio != null ? ` a ${fmt(l.precio, l.clase === 'Renta fija' ? 3 : 2)}` : ''}`, l.costo != null ? `Costo ${fmt(l.costo)}` : null].filter(Boolean).join(' · ')
}

function detalleTitulo(l: LineaPosicion) {
  const partes: string[] = []
  if (l.clase === 'Renta fija') {
    partes.push(l.tasa != null ? `Cupón ${(l.tasa * 100).toFixed(3)}%` : 'Cupón s/d')
    partes.push(l.vencimiento ? `Vto. ${ddmmyyyy(l.vencimiento)}` : l.perpetuo ? 'Perpetuo' : 'Vto. s/d')
  }
  const compras = textoCompras(l.fechasCompra)
  if (compras) partes.push(compras)
  return partes.join(' · ')
}

function plazosRentaFija(r: Reporte) {
  const anios = (vto: string) => (Date.parse(vto) - Date.parse(r.fecha)) / (365.25 * 864e5)
  const rf = r.posiciones.filter((l) => l.clase === 'Renta fija')
  const total = rf.reduce((s, l) => s + l.total, 0)
  const tramos: [string, (l: LineaPosicion) => boolean][] = [
    ['Hasta 1 año', (l) => !!l.vencimiento && anios(l.vencimiento) <= 1],
    ['1 a 3 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 1 && anios(l.vencimiento) <= 3],
    ['3 a 5 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 3 && anios(l.vencimiento) <= 5],
    ['5 a 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 5 && anios(l.vencimiento) <= 10],
    ['Más de 10 años', (l) => !!l.vencimiento && anios(l.vencimiento) > 10],
    ['Perpetuos', (l) => !l.vencimiento],
  ]
  return tramos.map(([label, f]) => {
    const valor = rf.filter(f).reduce((s, l) => s + l.total, 0)
    return { label, valor, peso: total ? valor / total : 0 }
  }).filter((t) => t.valor > 0)
}

const COLOR_CATEGORIA: Record<string, string> = {
  Compras: 'bg-sky-50 text-sky-800', 'Ventas y vencimientos': 'bg-violet-50 text-violet-800', 'Cupones e intereses': 'bg-emerald-50 text-emerald-800',
  Dividendos: 'bg-emerald-50 text-emerald-800', Transferencias: 'bg-slate-100 text-slate-700', 'Comisiones y gastos': 'bg-amber-50 text-amber-800',
  Impuestos: 'bg-red-50 text-red-700', 'Money market': 'bg-gray-50 text-gray-500', Cancelaciones: 'bg-gray-50 text-gray-600', Otros: 'bg-gray-50 text-gray-600',
}

function VistaReporte({ r, cliente, cuentas, manuales, setManual }: {
  r: Reporte
  cliente: string
  cuentas: string
  manuales: Record<string, number>
  setManual: (clave: string, v: number | null) => void
}) {
  const t = r.totales
  const [verTodosMov, setVerTodosMov] = useState(false)
  const movimientos = r.movimientos.filter((m) => categoriaMovimiento(m) !== 'Money market')
  const ocultos = r.movimientos.length - movimientos.length
  const plazos = plazosRentaFija(r)
  const fuentes = new Set(r.posiciones.map((p) => p.fuenteCorrido).filter(Boolean))

  return (
    <div id="reporte-consolidado" className="space-y-5 text-sm text-gray-800">
      {/* Encabezado */}
      <div className="rounded-xl bg-gradient-to-br from-[#1B2A38] to-[#1B3A2B] p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-200/80">Posición consolidada</p>
            <h2 className="mt-1 text-3xl font-semibold">{cliente || 'Sin nombre de cliente'}</h2>
            <p className="mt-1 text-sm text-slate-300">Valuación al {ddmmyyyy(r.fecha)}{cuentas ? ` · ${cuentas}` : ''}</p>
          </div>
          {r.posiciones.length > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-300">Valor total de la cuenta</p>
              <p className="text-4xl font-semibold tabular-nums">USD {fmt(t.total)}</p>
              <p className="text-xs text-slate-300">incluye USD {fmt(t.cuponCorrido)} de cupón corrido</p>
            </div>
          )}
        </div>
      </div>

      {r.posiciones.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Valor de mercado" valor={`USD ${fmt(t.valorMercado)}`} acento="#1B2A38" />
            <Kpi label="Cupón corrido" valor={`USD ${fmt(t.cuponCorrido)}`} sub="Intereses devengados no cobrados" acento="#B45309" />
            <Kpi label="Resultado no realizado" valor={`${signo(t.resultado)}USD ${fmt(t.resultado)}`} sub={t.costo ? `${signo(t.resultado)}${fmtPct(t.resultado / t.costo, 2)} sobre el costo` : undefined} acento={t.resultado >= 0 ? '#15803D' : '#B91C1C'} />
            <Kpi label="Renta estimada 12 meses" valor={r.renta.filas.length ? `USD ${fmt(r.renta.total)}` : '—'} sub={r.renta.filas.length ? 'Cupones y dividendos' : 'Subí el calendario de cupones'} acento="#2E7D52" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Tarjeta titulo="Por clase de activo">
              <div className="flex items-center gap-4">
                <Dona datos={r.porClase.map((c) => ({ label: c.clase, valor: c.total, color: COLOR_CLASE[c.clase] }))} centro={compacto(t.total)} />
                <ul className="flex-1 space-y-1.5">
                  {r.porClase.map((c) => (
                    <li key={c.clase} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_CLASE[c.clase] }} />{c.clase}</span>
                      <span className="font-semibold tabular-nums">{fmtPct(c.peso)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Tarjeta>
            <Tarjeta titulo="Por custodio">
              <div className="space-y-4">
                {r.porBanco.map((b) => (
                  <div key={b.banco}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-gray-700">{b.banco}</span>
                      <span className="tabular-nums"><b>{fmtPct(b.peso)}</b> · USD {fmt(b.total, 0)}</span>
                    </div>
                    <Barra peso={b.peso} color={COLOR_CUSTODIO[b.banco]} />
                    <p className="mt-1 text-[11px] text-gray-400">{b.cantidad} posiciones · cupón corrido USD {fmt(b.cuponCorrido)}</p>
                  </div>
                ))}
              </div>
            </Tarjeta>
            <Tarjeta titulo="Renta fija por plazo">
              {plazos.length ? (
                <div className="space-y-2.5">
                  {plazos.map((p) => (
                    <div key={p.label}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-gray-600">{p.label}</span><span className="font-semibold tabular-nums">{fmtPct(p.peso)}</span></div>
                      <Barra peso={p.peso} color="#1B3A2B" />
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400">Sin renta fija.</p>}
            </Tarjeta>
          </div>

          {/* Posiciones */}
          <div className="space-y-3">
            {CLASES.map((clase) => {
              const ls = r.posiciones.filter((l) => l.clase === clase)
              if (!ls.length) return null
              const s = r.porClase.find((c) => c.clase === clase)!
              return (
                <div key={clase} className="overflow-hidden rounded-xl border border-gray-200 bg-white" style={{ borderLeft: `4px solid ${COLOR_CLASE[clase]}` }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-gray-800">{clase} <span className="font-normal text-gray-400">· {ls.length} {ls.length === 1 ? 'posición' : 'posiciones'}</span></h3>
                    <p className="text-xs tabular-nums text-gray-500">
                      USD <b className="text-gray-800">{fmt(s.total)}</b> · {fmtPct(s.peso)}
                      {s.costo ? <span className={`ml-2 ${colorResultado(s.resultado)}`}>{signo(s.resultado)}{fmt(s.resultado)}</span> : null}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] table-fixed text-xs">
                      <colgroup>
                        <col style={{ width: '36%' }} /><col style={{ width: '9%' }} /><col style={{ width: '12%' }} /><col style={{ width: '11%' }} />
                        <col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                          <th className="px-4 py-2 text-left font-medium">Instrumento</th>
                          <th className="px-2 py-2 text-left font-medium">Custodio</th>
                          <th className="px-2 py-2 text-right font-medium">Valor de mercado</th>
                          <th className="px-2 py-2 text-right font-medium">Cupón corrido</th>
                          <th className="px-2 py-2 text-right font-medium">Total</th>
                          <th className="px-2 py-2 text-right font-medium">Resultado</th>
                          <th className="w-28 px-4 py-2 text-right font-medium">% cuenta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ls.map((l) => {
                          const det = detalleTitulo(l)
                          const cant = lineaCantidad(l)
                          return (
                            <tr key={clavePosicion(l)} className="border-t border-gray-50 align-top hover:bg-gray-50/60">
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-gray-900" title={l.descripcion}>{l.nombre}</p>
                                {det && <p className="text-[11px] text-gray-500">{det}</p>}
                                {cant && <p className="text-[11px] text-gray-400">{cant}</p>}
                              </td>
                              <td className="px-2 py-2.5"><EtiquetaBanco banco={l.banco} /></td>
                              <td className="px-2 py-2.5 text-right tabular-nums">{fmt(l.valorMercado)}</td>
                              <td className="px-2 py-2.5 text-right"><CorridoEditable l={l} manual={manuales[clavePosicion(l)]} setManual={setManual} /></td>
                              <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{fmt(l.total)}</td>
                              <td className={`px-2 py-2.5 text-right tabular-nums ${colorResultado(l.resultado)}`}>
                                {l.resultado == null ? '—' : `${signo(l.resultado)}${fmt(l.resultado)}`}
                                {l.resultado != null && l.costo ? <p className="text-[10px]">{signo(l.resultado)}{fmtPct(l.resultado / l.costo, 2)}</p> : null}
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="mb-1 text-right tabular-nums text-gray-600">{fmtPct(l.peso)}</p>
                                <Barra peso={l.peso / Math.max(...r.posiciones.map((x) => x.peso))} color={COLOR_CLASE[clase]} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1B2A38] px-4 py-3 text-white">
              <span className="text-sm font-semibold">Total de la cuenta</span>
              <span className="text-xs tabular-nums text-slate-300">
                Valor de mercado <b className="text-white">{fmt(t.valorMercado)}</b> · Cupón corrido <b className="text-white">{fmt(t.cuponCorrido)}</b> · Total <b className="text-base text-white">USD {fmt(t.total)}</b>
              </span>
            </div>
            {fuentes.size > 0 && (
              <p className="text-[11px] text-gray-400">
                Cupón corrido al {ddmmyyyy(r.fecha)}: cupón del próximo pago × días desde el último (30/360).
                {fuentes.has('tasa') && ' ≈ estimado con tasa y vencimiento.'}
                {fuentes.has('sin datos') && ' ! sin datos para calcularlo.'}
                {fuentes.has('manual') && ' ✎ cargado a mano.'} Hacé clic en un importe para corregirlo.
              </p>
            )}
          </div>
        </>
      )}

      {/* Renta */}
      {r.renta.filas.length > 0 && (
        <Tarjeta>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Renta estimada · próximos 12 meses</h3>
            <p className="text-xs text-gray-500">
              Total <b className="text-gray-900">USD {fmt(r.renta.total)}</b> · Cupones {fmt(r.renta.cupones)} · Dividendos {fmt(r.renta.dividendos)}
            </p>
          </div>
          <GraficoRenta meses={r.renta.meses} montos={r.renta.montos} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[#2D3F52]">Ver detalle por instrumento</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="px-2 py-1.5 text-left font-medium">Instrumento</th>
                  {r.renta.meses.map((m) => <th key={m} className="px-1.5 py-1.5 text-right font-medium">{mesCorto(m)}</th>)}
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr></thead>
                <tbody>
                  {r.renta.filas.map((f, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-2 py-1.5"><EtiquetaBanco banco={f.banco} /> <span className="ml-1">{r.posiciones.find((l) => l.banco === f.banco && l.cusip === f.cusip)?.nombre ?? f.descripcion}</span></td>
                      {f.montos.map((v, j) => <td key={j} className="px-1.5 py-1.5 text-right tabular-nums">{v ? fmt(v, 0) : ''}</td>)}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(f.total, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Tarjeta>
      )}

      {/* Movimientos */}
      {r.movimientos.length > 0 && (
        <Tarjeta>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Movimientos</h3>
            <p className="text-xs text-gray-400">Del {ddmmyyyy(r.periodoMovimientos.desde)} al {ddmmyyyy(r.periodoMovimientos.hasta)}</p>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {r.resumenMovimientos.map((c) => (
              <div key={c.categoria} className={`rounded-lg px-3 py-2 ${COLOR_CATEGORIA[c.categoria] ?? 'bg-gray-50 text-gray-700'}`}>
                <p className="text-[10px] uppercase tracking-wide opacity-80">{c.categoria} · {c.cantidad}</p>
                <p className="text-sm font-semibold tabular-nums">{fmt(c.monto)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-2 py-1.5 text-left font-medium">Fecha</th><th className="px-2 py-1.5 text-left font-medium">Custodio</th>
                <th className="px-2 py-1.5 text-left font-medium">Tipo</th><th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                <th className="px-2 py-1.5 text-right font-medium">Monto</th>
              </tr></thead>
              <tbody>
                {(verTodosMov ? movimientos : movimientos.slice(0, 15)).map((m, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="whitespace-nowrap px-2 py-1.5">{ddmmyyyy(m.fecha)}</td>
                    <td className="px-2 py-1.5"><EtiquetaBanco banco={m.banco} /></td>
                    <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] ${COLOR_CATEGORIA[categoriaMovimiento(m)] ?? ''}`}>{categoriaMovimiento(m)}</span></td>
                    <td className="px-2 py-1.5 text-gray-600">
                      {m.descripcion}
                      {m.cantidad != null && <span className="text-gray-400"> · {fmt(m.cantidad, Number.isInteger(m.cantidad) ? 0 : 3)}{m.precio != null ? ` a ${fmt(m.precio, 3)}` : ''}</span>}
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums ${colorResultado(m.monto)}`}>{fmt(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>{ocultos > 0 ? `${ocultos} movimientos de money market no se detallan (están en el resumen y en el Excel).` : ''}</span>
            {movimientos.length > 15 && (
              <button onClick={() => setVerTodosMov((v) => !v)} className="font-medium text-[#2D3F52] underline">
                {verTodosMov ? 'Ver menos' : `Ver los ${movimientos.length} movimientos`}
              </button>
            )}
          </div>
        </Tarjeta>
      )}

      {r.avisos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="mb-1 font-semibold">Revisar</p>
          <ul className="list-disc space-y-0.5 pl-4">{r.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
