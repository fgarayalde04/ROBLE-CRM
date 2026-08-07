'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Solicitud {
  id: string; solicitud_id: string; asesor: string; estado: string
  tipo_operacion: string; instrumento_tipo: string; instrumento_nombre: string
  clase: string | null; moneda: string; monto: number | null; cantidad: number | null
  fecha_operacion: string; client_name: string; client_number: string
  operador: string | null; tomado_at: string | null
  mail_enviado_at: string | null; ejecutado_at: string | null; created_at: string
  _legacy?: boolean
}

// Normaliza un registro de order_history_items al formato Solicitud
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLegacy(r: any): Solicitud {
  const estado = r.cancelado_at ? 'cancelada' : r.done ? 'ejecutada' : r.mail_respondido ? 'mail_enviado' : 'pendiente_revision'
  return {
    id:                r.id,
    solicitud_id:      `ORD-${(r.orden_id ?? r.order_id ?? '').slice(0,8)}`,
    asesor:            r.user_name ?? '—',
    estado,
    tipo_operacion:    r.operation_type ?? 'compra',
    instrumento_tipo:  r.order_type ?? '—',
    instrumento_nombre:r.instrument_name ?? '—',
    clase:             null,
    moneda:            r.moneda ?? 'USD',
    monto:             r.valor_efectivo ?? null,
    cantidad:          r.quantity ?? null,
    fecha_operacion:   r.order_date ?? r.order_created_at?.split('T')[0] ?? '',
    client_name:       r.client_name ?? '—',
    client_number:     r.client_number ?? '—',
    operador:          r.ejecutado_by ?? null,
    tomado_at:         null,
    mail_enviado_at:   r.mail_respondido_at ?? null,
    ejecutado_at:      r.ejecutado_at ?? null,
    created_at:        r.order_created_at ?? r.item_created_at ?? new Date().toISOString(),
    _legacy:           true,
  }
}

const ESTADO_CFG: Record<string, { label: string; color: string; dot: string }> = {
  pendiente_revision: { label: 'Pendiente revisión', color: 'text-amber-700',   dot: 'bg-amber-400' },
  en_revision:        { label: 'En revisión',        color: 'text-blue-700',    dot: 'bg-blue-400' },
  devuelta:           { label: 'Devuelta',           color: 'text-orange-700',  dot: 'bg-orange-400' },
  mesa_operaciones:   { label: 'Mesa de Operaciones',color: 'text-amber-700',   dot: 'bg-amber-400' },
  mail_enviado:       { label: 'Mail enviado',       color: 'text-indigo-700',  dot: 'bg-indigo-400' },
  en_ejecucion:       { label: 'En ejecución',       color: 'text-purple-700',  dot: 'bg-purple-400' },
  ejecutada:          { label: 'Ejecutada',          color: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelada:          { label: 'Cancelada',          color: 'text-gray-400',    dot: 'bg-gray-300' },
}
const OP_LABEL: Record<string,string> = { compra:'Compra',venta:'Venta',suscripcion:'Compra',rescate:'Venta' }

const inputCls = 'border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 bg-white'

const TIPO_CFG: Record<string, { label: string; cls: string }> = {
  acciones: { label: 'Acciones', cls: 'bg-blue-50 text-blue-700' },
  fondos:   { label: 'Fondos',   cls: 'bg-emerald-50 text-emerald-700' },
  bonos:    { label: 'Bonos',    cls: 'bg-amber-50 text-amber-700' },
  fondo:    { label: 'Fondo',    cls: 'bg-emerald-50 text-emerald-700' },
  bono:     { label: 'Bono',     cls: 'bg-amber-50 text-amber-700' },
  accion:   { label: 'Acción',   cls: 'bg-blue-50 text-blue-700' },
}

function exportCSV(rows: Solicitud[]) {
  const headers = ['N° Interno','Fecha','Hora','Cliente','N°','Asesor','Operación','Tipo','Instrumento','Moneda','Monto ($)','Cantidad','Estado','Operador','Fecha ejecución']
  const lines = rows.map(r => [
    r.solicitud_id,
    r.fecha_operacion,
    format(new Date(r.created_at), 'HH:mm'),
    r.client_name, r.client_number, r.asesor,
    OP_LABEL[r.tipo_operacion] ?? r.tipo_operacion,
    r.instrumento_tipo,
    r.instrumento_nombre,
    r.moneda,
    r.monto ?? '',
    r.cantidad ?? '',
    ESTADO_CFG[r.estado]?.label ?? r.estado,
    r.operador ?? '',
    r.ejecutado_at ? format(new Date(r.ejecutado_at), 'dd/MM/yyyy HH:mm') : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `blotter_${new Date().toISOString().split('T')[0]}.csv`; a.click()
}

const PAGE_SIZE = 100

export default function BlotterSolicitudes({ isMesa, userName }: { isMesa: boolean; userName?: string }) {
  const [rows, setRows]         = useState<Solicitud[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage]         = useState(0)
  const [total, setTotal]       = useState(0)

  // Filtros
  const [q, setQ]             = useState('')
  const [estado, setEstado]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [asesor, setAsesor]     = useState('')
  const [operador, setOperador] = useState('')
  const [tipoOp, setTipoOp]     = useState('')
  const [tipoInst, setTipoInst] = useState('')

  async function doFetch(pageNum: number, append: boolean) {
    if (append) setLoadingMore(true); else setLoading(true)
    const p = new URLSearchParams()
    if (q)        p.set('q', q)
    if (estado)   p.set('estado', estado)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo)   p.set('dateTo', dateTo)
    if (asesor)   p.set('asesor', asesor)
    p.set('limit', String(PAGE_SIZE))
    p.set('page',  String(pageNum))

    const [res, legacyRes] = await Promise.all([
      fetch('/api/solicitudes?' + p),
      isMesa && pageNum === 0 ? fetch('/api/ordenes/blotter') : Promise.resolve(null),
    ])
    const json = await res.json()
    let data: Solicitud[] = json.solicitudes ?? []

    // Mezclar registros del sistema anterior solo en la primera carga
    if (legacyRes) {
      try {
        const legacyJson = await legacyRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacy: Solicitud[] = (legacyJson.rows ?? []).map((r: any) => normalizeLegacy(r))
        // Filtrar legacy con los mismos filtros del cliente
        let filteredLegacy = legacy
        if (q) {
          const lq = q.toLowerCase()
          filteredLegacy = filteredLegacy.filter(r =>
            r.client_name.toLowerCase().includes(lq) ||
            r.instrumento_nombre.toLowerCase().includes(lq) ||
            r.solicitud_id.toLowerCase().includes(lq) ||
            r.asesor.toLowerCase().includes(lq)
          )
        }
        if (estado)   filteredLegacy = filteredLegacy.filter(r => r.estado === estado)
        if (asesor)   filteredLegacy = filteredLegacy.filter(r => r.asesor.toLowerCase().includes(asesor.toLowerCase()))
        if (tipoInst) filteredLegacy = filteredLegacy.filter(r => r.instrumento_tipo === tipoInst)
        if (tipoOp)   filteredLegacy = filteredLegacy.filter(r => r.tipo_operacion === tipoOp)
        if (dateFrom) filteredLegacy = filteredLegacy.filter(r => (r.fecha_operacion ?? '') >= dateFrom)
        if (dateTo)   filteredLegacy = filteredLegacy.filter(r => (r.fecha_operacion ?? '') <= dateTo)
        data = [...data, ...filteredLegacy]
          .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      } catch {
        // Si falla el legacy, continuar solo con solicitudes
      }
    }

    if (!legacyRes) {
      // Paginación sin legacy — filtros de cliente
      if (operador) data = data.filter(r => r.operador?.toLowerCase().includes(operador.toLowerCase()))
      if (tipoOp)   data = data.filter(r => r.tipo_operacion === tipoOp)
      if (tipoInst) data = data.filter(r => r.instrumento_tipo === tipoInst)
    }

    setRows(prev => append ? [...prev, ...data] : data)
    setTotal(json.total ?? 0)
    setPage(pageNum)
    if (append) setLoadingMore(false); else setLoading(false)
  }

  const fetchRows = useCallback(() => { doFetch(0, false) },
    [q, estado, dateFrom, dateTo, asesor, operador, tipoOp, tipoInst]) // eslint-disable-line

  useEffect(() => { fetchRows() }, [fetchRows])

  function loadMore() { doFetch(page + 1, true) }

  function clearFilters() {
    setQ(''); setEstado(''); setDateFrom(''); setDateTo('')
    setAsesor(''); setOperador(''); setTipoOp(''); setTipoInst('')
  }

  const activeFilters = [q,estado,dateFrom,dateTo,asesor,operador,tipoOp,tipoInst].filter(Boolean).length
  const hasMore = rows.length < total

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="text" placeholder="Cliente, instrumento, ID…" value={q}
            onChange={e => setQ(e.target.value)} className={inputCls + ' flex-1 min-w-[160px]'} />

          <select value={estado} onChange={e => setEstado(e.target.value)} className={inputCls}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={tipoOp} onChange={e => setTipoOp(e.target.value)} className={inputCls}>
            <option value="">Todas las operaciones</option>
            {Object.entries(OP_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select value={tipoInst} onChange={e => setTipoInst(e.target.value)} className={inputCls}>
            <option value="">Todos los instrumentos</option>
            <option value="fondos">Fondos</option>
            <option value="bonos">Bonos</option>
            <option value="acciones">Acciones</option>
          </select>

          {isMesa && (
            <input type="text" placeholder="Asesor…" value={asesor}
              onChange={e => setAsesor(e.target.value)} className={inputCls + ' w-28'} />
          )}
          <input type="text" placeholder="Operador…" value={operador}
            onChange={e => setOperador(e.target.value)} className={inputCls + ' w-28'} />

          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>

          <button onClick={fetchRows} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50">↻</button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50">
              Limpiar ({activeFilters})
            </button>
          )}
          <button onClick={() => exportCSV(rows)}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 ml-auto">
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Banner de contexto */}
      {!isMesa && userName && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2D3F52]/5 border border-[#2D3F52]/10 rounded-lg">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2D3F52]" />
          <p className="text-xs text-[#2D3F52] font-medium">Mostrando solicitudes de <span className="font-semibold">{userName}</span></p>
        </div>
      )}
      {isMesa && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <p className="text-xs text-amber-700 font-medium">Historial completo — solicitudes de todos los asesores + órdenes históricas</p>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {loading ? 'Cargando…' : `${rows.length}${total > rows.length ? ` de ${total}` : ''} resultado${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['N° Interno','Fecha','Hora','Cliente','Asesor','Operación','Tipo','Instrumento','Moneda','Monto ($)','Cantidad','Estado','Operador','Ejecutada'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados.</td></tr>
              ) : rows.map(row => {
                const cfg = ESTADO_CFG[row.estado] ?? ESTADO_CFG.mesa_operaciones
                const tipoCfg = TIPO_CFG[row.instrumento_tipo?.toLowerCase() ?? '']
                return (
                  <tr key={row.id}
                    onClick={() => setSelected(selected === row.id ? null : row.id)}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${selected === row.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] font-mono text-gray-500">{row.solicitud_id}</span>
                      {row._legacy && <span className="ml-1 text-[9px] font-semibold text-gray-400 bg-gray-100 px-1 rounded">hist</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.fecha_operacion}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{format(new Date(row.created_at),'HH:mm')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-800">{row.client_name}</p>
                      <p className="text-[10px] text-gray-400">#{row.client_number}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.asesor}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">{OP_LABEL[row.tipo_operacion] ?? row.tipo_operacion}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {tipoCfg
                        ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tipoCfg.cls}`}>{tipoCfg.label}</span>
                        : <span className="text-xs text-gray-400">{row.instrumento_tipo ?? '—'}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-800 max-w-[160px]">
                      <p className="truncate">{row.instrumento_nombre}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.moneda}</td>
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                      {row.monto ? Number(row.monto).toLocaleString('es-UY') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                      {row.cantidad ? Number(row.cantidad).toLocaleString('es-UY') : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.operador ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                      {row.ejecutado_at ? format(new Date(row.ejecutado_at), 'dd/MM HH:mm') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cargar más */}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button onClick={loadMore} disabled={loadingMore}
            className="px-5 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-600 transition">
            {loadingMore ? 'Cargando…' : `Cargar más (${total - rows.length} restantes)`}
          </button>
        </div>
      )}
    </div>
  )
}
