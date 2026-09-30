'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PERFIL_CLIENTE, perfilFromPuntaje, type EstadoPerfil } from '@/lib/riskGroups'
import type { ResumenClienteRiesgo, ResultadoCarga } from '@/lib/db/clientPositions'
import { leerExcel, type Lectura } from '@/lib/posicionesExcel'

// ─── Estilos ─────────────────────────────────────────────────────────────────

const ESTADO: Record<EstadoPerfil, { label: string; cls: string }> = {
  excedido:       { label: 'Excedido',      cls: 'bg-red-50 text-red-700 border-red-200' },
  dentro:         { label: 'Dentro',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  sin_perfil:     { label: 'Sin perfil',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sin_posiciones: { label: 'Sin datos',     cls: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const usd = (n: number) => n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// ─── Componente ──────────────────────────────────────────────────────────────

export default function PosicionesManager() {
  const [data, setData] = useState<{ clientes: ResumenClienteRiesgo[]; sinCliente: { cuentas: number; monto: number }; ultimaCarga: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<EstadoPerfil | ''>('')
  const [q, setQ] = useState('')

  // Carga
  const [modal, setModal] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [fileName, setFileName] = useState('')
  const [cuentaManual, setCuentaManual] = useState('')
  const [fechaDatos, setFechaDatos] = useState(() => new Date().toISOString().slice(0, 10))
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null)
  const [cargaError, setCargaError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/posiciones')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Error al cargar')
      setData(d)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  function abrirCarga() {
    setLectura(null); setResultado(null); setCargaError(''); setCuentaManual(''); setFileName('')
    if (fileRef.current) fileRef.current.value = ''
    setModal(true)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResultado(null); setCargaError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const l = leerExcel(ev.target?.result as ArrayBuffer)
        if (!l || l.filas.length === 0) {
          setLectura(null)
          setCargaError('No se encontró una tabla de posiciones: tiene que haber una fila de encabezados con nombre/descripción y valor de mercado o cantidad.')
          return
        }
        setLectura(l)
        setCuentaManual(l.cuentaTitulo ?? '')
      } catch {
        setCargaError('No se pudo leer el archivo (.xlsx, .xls o .csv).')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const filasFinales = useMemo(() => {
    if (!lectura) return []
    return lectura.sinCuenta ? lectura.filas.map(f => ({ ...f, account: cuentaManual.trim() })) : lectura.filas
  }, [lectura, cuentaManual])
  const cuentasEnArchivo = useMemo(() => new Set(filasFinales.map(f => f.account).filter(Boolean)).size, [filasFinales])
  const faltaCuenta = !!lectura && filasFinales.some(f => !f.account)

  async function confirmarCarga() {
    if (!lectura || faltaCuenta) return
    setCargando(true); setCargaError('')
    try {
      const res = await fetch('/api/posiciones/carga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: filasFinales, fileName, fechaDatos }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Error al cargar')
      setResultado(d); setLectura(null)
      fetchAll()
    } catch (e: any) { setCargaError(e.message) } finally { setCargando(false) }
  }

  const clientes = (data?.clientes ?? []).filter(c =>
    (!filtro || c.estado === filtro) &&
    (!q || c.nombre.toLowerCase().includes(q.toLowerCase()) || c.clientNumber.toLowerCase().includes(q.toLowerCase()) || (c.asesor ?? '').toLowerCase().includes(q.toLowerCase()))
  )
  const cuenta = (e: EstadoPerfil) => (data?.clientes ?? []).filter(c => c.estado === e).length

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#2D3F52]">Posiciones y riesgo por cliente</p>
            <p className="text-[11px] text-gray-400">
              {data?.ultimaCarga
                ? <>Última carga: {new Date(data.ultimaCarga.loaded_at).toLocaleDateString('es-UY')} ({data.ultimaCarga.cuentas} cuentas, datos al {data.ultimaCarga.fecha_datos ?? '—'}). Después se ajusta sola con cada orden ejecutada.</>
                : 'Todavía no hay posiciones cargadas. Hacé la carga inicial; después se ajusta sola con cada orden ejecutada.'}
            </p>
          </div>
          <button onClick={abrirCarga} className="px-3 py-1.5 text-xs font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] transition">
            Cargar posiciones (Excel)
          </button>
        </div>

        <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 items-center">
          <input
            className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D3F52] placeholder-gray-300"
            placeholder="Cliente, número o asesor…" value={q} onChange={e => setQ(e.target.value)}
          />
          {(['', 'excedido', 'sin_perfil', 'dentro'] as const).map(e => (
            <button key={e || 'todos'} onClick={() => setFiltro(e)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${filtro === e ? 'border-[#2D3F52] bg-gray-50 font-semibold text-[#2D3F52]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {e ? `${ESTADO[e].label} (${cuenta(e)})` : `Todos (${data?.clientes.length ?? 0})`}
            </button>
          ))}
        </div>
        {!!data?.sinCliente.cuentas && (
          <div className="px-4 md:px-5 pb-3 text-[11px] text-amber-700">
            {data.sinCliente.cuentas} cuenta(s) cargadas no están vinculadas a un cliente ({usd(data.sinCliente.monto)}). Se vinculan desde la base de cuentas de Monitoreo.
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Cargando…</div>
        ) : error ? (
          <div className="py-14 text-center text-sm text-red-600">{error}</div>
        ) : clientes.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">{data?.clientes.length ? 'Ningún cliente con ese filtro.' : 'Sin posiciones cargadas.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="pl-4 pr-2 py-2.5 text-left">Cliente</th>
                  <th className="px-2 py-2.5 text-left">Perfil asignado</th>
                  <th className="px-2 py-2.5 text-left">Riesgo de la cartera</th>
                  <th className="px-2 py-2.5 text-left">Estado</th>
                  <th className="px-2 py-2.5 text-right">Monto</th>
                  <th className="px-2 py-2.5 pr-4 text-right">Sin clasificar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clientes.map(c => (
                  <tr key={c.clientNumber} className="hover:bg-gray-50/60">
                    <td className="pl-4 pr-2 py-2.5">
                      {c.clientId
                        ? <Link href={`/clients/${c.clientId}`} className="font-semibold text-[#2D3F52] hover:underline">{c.nombre}</Link>
                        : <span className="font-semibold text-[#2D3F52]">{c.nombre}</span>}
                      <p className="text-[10px] text-gray-400">{c.clientNumber}{c.asesor ? ` · ${c.asesor}` : ''}</p>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-gray-700">
                      {c.perfilAsignado ? `${PERFIL_CLIENTE[c.perfilAsignado].label} (hasta ${PERFIL_CLIENTE[c.perfilAsignado].tope})` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-gray-700">
                      {c.puntaje != null ? <><b>{c.puntaje.toFixed(1)}</b> · {PERFIL_CLIENTE[perfilFromPuntaje(c.puntaje)].label}</> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ESTADO[c.estado].cls}`}>{ESTADO[c.estado].label}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[12px] text-gray-700">{usd(c.montoTotal)}</td>
                    <td className={`px-2 py-2.5 pr-4 text-right text-[12px] ${c.pctSinClasificar >= 10 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                      {c.pctSinClasificar ? `${c.pctSinClasificar.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-[14px] font-bold text-[#2D3F52]">Cargar posiciones</span>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition" aria-label="Cerrar">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto text-[12px]">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-blue-700 space-y-1">
                <p>Subí el export de posiciones (Pershing, Morgan Stanley u otro). Tiene que tener una fila de encabezados con <b>nombre/descripción</b> y <b>valor de mercado</b> (o cantidad); se usan también cuenta, tipo, símbolo, CUSIP e ISIN si están.</p>
                <p>La carga <b>reemplaza</b> las posiciones de las cuentas que vienen en el archivo. Las demás cuentas no se tocan.</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="block w-full text-sm" />

              {lectura && (
                <div className="space-y-2">
                  <p className="text-gray-600">
                    <b>{lectura.filas.length}</b> posiciones leídas · columnas: {lectura.columnas.join(', ')}
                  </p>
                  {lectura.sinCuenta && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Número de cuenta (el archivo no trae columna de cuenta)</label>
                      <input className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" value={cuentaManual} onChange={e => setCuentaManual(e.target.value)} placeholder="Ej: ROJ902303" />
                    </div>
                  )}
                  {!lectura.sinCuenta && <p className="text-gray-600">{cuentasEnArchivo} cuenta(s) en el archivo.</p>}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fecha de los datos</label>
                    <input type="date" className="text-sm px-3 py-2 rounded-lg border border-gray-200" value={fechaDatos} onChange={e => setFechaDatos(e.target.value)} />
                  </div>
                  <div className="rounded-lg border border-gray-200 max-h-40 overflow-auto">
                    <table className="w-full text-[11px]">
                      <tbody className="divide-y divide-gray-50">
                        {filasFinales.slice(0, 8).map((f, i) => (
                          <tr key={i}><td className="px-2 py-1 text-gray-500">{f.account || '—'}</td><td className="px-2 py-1 truncate max-w-[220px]">{f.nombre}</td><td className="px-2 py-1 text-gray-400">{f.producto ?? ''}</td><td className="px-2 py-1 text-right">{String(f.monto ?? '')}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {cargaError && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700">{cargaError}</div>}

              {resultado && (
                <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-1">
                  <p className="font-bold">Carga completa</p>
                  <p>{resultado.posiciones} posiciones de {resultado.cuentas} cuenta(s), {resultado.clientes} cliente(s).</p>
                  {resultado.cuentasSinCliente.length > 0 && (
                    <p className="text-amber-700">Cuentas sin cliente vinculado: {resultado.cuentasSinCliente.join(', ')}. Se cargaron igual; vinculalas en la base de cuentas de Monitoreo para que sumen al cliente.</p>
                  )}
                  {resultado.sinTipo > 0 && <p className="text-amber-700">{resultado.sinTipo} fila(s) sin tipo de activo reconocible: se tomaron como fondos.</p>}
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              {lectura && !resultado && (
                <button onClick={confirmarCarga} disabled={cargando || faltaCuenta}
                  className="flex-1 py-2 text-sm font-bold text-white bg-[#2D3F52] rounded-lg hover:bg-[#3a4f64] disabled:opacity-40 transition">
                  {cargando ? 'Cargando…' : faltaCuenta ? 'Falta el número de cuenta' : `Cargar ${filasFinales.length} posiciones`}
                </button>
              )}
              <button onClick={() => setModal(false)} className="flex-1 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                {resultado ? 'Cerrar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
