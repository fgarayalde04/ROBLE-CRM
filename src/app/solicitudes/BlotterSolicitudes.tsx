'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Solicitud {
  id: string; solicitud_id: string; asesor: string; estado: string
  tipo_operacion: string; instrumento_tipo: string; instrumento_nombre: string
  clase: string | null; moneda: string; monto: number | null; cantidad: number | null
  fecha_operacion: string; client_name: string; client_number: string
  client_email?: string | null
  operador: string | null; tomado_at: string | null
  mail_enviado_at: string | null; ejecutado_at: string | null; created_at: string
  observaciones?: string | null; comision?: string | null
  cusip_isin?: string | null; maturity?: string | null; cupon?: string | null
  mail_asunto?: string | null; mail_cuerpo?: string | null; mail_preview?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets_json?: any[] | null
  precio_ejecutado?: number | null; valor_efectivo?: number | null
  canal?: string | null; cc_emails?: string[] | null
  _legacy?: boolean
}

interface Evento {
  id: string; tipo: string; descripcion: string
  usuario: string; created_at: string
}

const ESTADO_STEPS_NEW = ['pendiente_revision','en_revision','mail_enviado','en_ejecucion','ejecutada'] as const
const ESTADO_STEPS_OLD = ['mesa_operaciones','mail_enviado','en_ejecucion','ejecutada'] as const

function ProgressBar({ estado }: { estado: string }) {
  if (estado === 'cancelada') return <span className="text-xs text-gray-400 italic">Cancelada</span>
  if (estado === 'devuelta')  return <span className="text-xs text-orange-600 font-medium">↩ Devuelta</span>
  const steps = ['mesa_operaciones'].includes(estado) ? ESTADO_STEPS_OLD : ESTADO_STEPS_NEW
  const idx = steps.indexOf(estado as never)
  return (
    <div className="flex items-center gap-0.5 w-full">
      {steps.map((step, i) => (
        <div key={step} className="flex-1 flex items-center gap-0.5">
          <div className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-[#2D3F52]' : 'bg-gray-200'}`} />
          <div className={`w-2 h-2 rounded-full shrink-0 ${i <= idx ? 'bg-[#2D3F52]' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  )
}

function DetalleSolicitud({ sol, eventos, isMesa, onAction, onClose, onRefresh }: {
  sol: Solicitud; eventos: Evento[]; isMesa: boolean
  onAction: (accion: string, extra?: Record<string,unknown>) => Promise<void>
  onClose: () => void; onRefresh: () => void
}) {
  const [showEjecutar, setShowEjecutar] = useState(false)
  const [showCancelar, setShowCancelar] = useState(false)
  const [precio, setPrecio] = useState('')
  const [valor,  setValor]  = useState('')
  const [motivo, setMotivo] = useState('')
  const [busy,   setBusy]   = useState(false)

  const cfg = (ESTADO_CFG[sol.estado] ?? ESTADO_CFG.mesa_operaciones) as { label:string; color:string; dot:string }
  const canAct = isMesa && !sol._legacy && sol.estado !== 'cancelada' && sol.estado !== 'ejecutada'

  async function act(accion: string, extra?: Record<string,unknown>) {
    setBusy(true); await onAction(accion, extra); setBusy(false)
  }

  return (
    <div className="w-80 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-gray-400">{sol.solicitud_id}</p>
          <p className="font-semibold text-gray-800 truncate">{sol.client_name}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.dot.replace('bg-','bg-').replace('-400','-100').replace('-500','-100')} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl shrink-0 leading-none">×</button>
      </div>

      {/* Progress */}
      {!sol._legacy && sol.estado !== 'cancelada' && (
        <div className="px-4 py-3 border-b border-gray-100">
          <ProgressBar estado={sol.estado} />
          <div className="flex justify-between mt-1">
            {(['mesa_operaciones'].includes(sol.estado) ? ESTADO_STEPS_OLD : ESTADO_STEPS_NEW).map((s: string) => (
              <span key={s} className={`text-[9px] ${sol.estado === s ? 'font-bold text-[#2D3F52]' : 'text-gray-300'}`}>
                {s === 'mesa_operaciones' ? 'Mesa' : s === 'pendiente_revision' ? 'Pend.' : s === 'en_revision' ? 'Rev.' : s === 'mail_enviado' ? 'Mail' : s === 'en_ejecucion' ? 'Ejec.' : 'Lista'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Datos */}
      <div className="px-4 py-3 space-y-1.5 border-b border-gray-100 overflow-y-auto flex-1">
        {([
          ['Operación', `${OP_LABEL[sol.tipo_operacion] ?? sol.tipo_operacion} · ${sol.instrumento_tipo ?? '—'}`],
          ['Instrumento', sol.instrumento_nombre],
          sol.clase        ? ['Clase', sol.clase]                                     : null,
          ['Moneda', sol.moneda],
          sol.monto        ? ['Monto',    `${sol.moneda} ${Number(sol.monto).toLocaleString('es-UY')}`]    : null,
          sol.cantidad     ? ['Cantidad', String(sol.cantidad)]                        : null,
          ['Fecha', sol.fecha_operacion],
          sol.cusip_isin   ? ['ISIN/CUSIP', sol.cusip_isin]                           : null,
          sol.maturity     ? ['Vencimiento', sol.maturity]                             : null,
          sol.cupon        ? ['Cupón', sol.cupon + '%']                                : null,
          ['Asesor', sol.asesor],
          sol.canal        ? ['Canal', sol.canal === 'directo_asesor' ? 'Envío directo por asesor' : sol.canal === 'directo_mesa' ? 'Envío directo por Mesa' : 'Derivada a Mesa'] : null,
          sol.operador     ? ['Operador', sol.operador]                                : null,
          sol.precio_ejecutado ? ['Precio ejec.', String(sol.precio_ejecutado)]       : null,
          sol.valor_efectivo   ? ['Valor ef.', `${sol.moneda} ${Number(sol.valor_efectivo).toLocaleString('es-UY')}`] : null,
          sol.comision     ? ['Comisión', sol.comision]                               : null,
        ] as ([string,string]|null)[]).filter(Boolean).map((entry) => {
          const [label, value] = entry as [string, string]
          return (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
              <span className="text-[11px] text-gray-800 text-right break-words max-w-[180px]">{value}</span>
            </div>
          )
        })}
        {sol.observaciones && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-0.5">Observaciones</p>
            <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{sol.observaciones}</p>
          </div>
        )}
      </div>

      {/* Acciones (solo nuevas solicitudes con isMesa) */}
      {canAct && (
        <div className="px-4 py-3 space-y-1.5 border-b border-gray-100">
          {sol.estado === 'mail_enviado' && (
            <button onClick={() => act('en_ejecucion')} disabled={busy}
              className="w-full py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              Marcar en ejecución
            </button>
          )}
          {(sol.estado === 'mail_enviado' || sol.estado === 'en_ejecucion') && (
            <button onClick={() => setShowEjecutar(true)}
              className="w-full py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              Marcar como ejecutada
            </button>
          )}
          <button onClick={() => setShowCancelar(true)}
            className="w-full py-2 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
            Cancelar solicitud
          </button>
        </div>
      )}

      {/* Historial */}
      <div className="px-4 py-3 overflow-y-auto max-h-48">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Historial</p>
        {eventos.length === 0 ? (
          <p className="text-xs text-gray-400">{sol._legacy ? 'Registro histórico del sistema anterior.' : 'Sin eventos.'}</p>
        ) : (
          <ul className="space-y-2">
            {eventos.map(ev => (
              <li key={ev.id} className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-700">{ev.descripcion}</p>
                  <p className="text-[10px] text-gray-400">{format(new Date(ev.created_at), "d MMM HH:mm", { locale: es })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal ejecutar */}
      {showEjecutar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">Confirmar ejecución</h2></div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Precio ejecutado (opcional)</label>
                <input type="number" step="0.01" className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                  value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valor efectivo (opcional)</label>
                <input type="number" step="0.01" className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                  value={valor} onChange={e => setValor(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowEjecutar(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={async () => { await act('ejecutar', { precio_ejecutado: precio||null, valor_efectivo: valor||null }); setShowEjecutar(false); onRefresh() }}
                disabled={busy} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                Confirmar ejecución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cancelar */}
      {showCancelar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">Cancelar solicitud</h2></div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Motivo (opcional)</label>
              <textarea rows={3} className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo…" />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowCancelar(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Volver</button>
              <button onClick={async () => { await act('cancelar', { motivo }); setShowCancelar(false); onRefresh() }}
                disabled={busy} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assetDisplay(a: any) {
  const tipo = a?.type as string | undefined
  const nombre =
    tipo === 'acciones' ? (a.nombre || a.ticker || '—')
    : tipo === 'fondos'  ? (a.fondo || '—')
    : tipo === 'bonos'   ? (a.descripcion || '—')
    : '—'
  const cantidad = tipo !== 'fondos' && a?.cantidad ? Number(a.cantidad) : null
  const monto    = tipo === 'fondos' && a?.monto    ? Number(a.monto)    : null
  return { tipo: tipo ?? null, nombre, moneda: a?.moneda ?? null, cantidad, monto, operacion: a?.operacion ?? null }
}

// One line per asset — a solicitud with 4 activos must show as 4 separate blotter lines
interface BlotterLine {
  row: Solicitud
  key: string
  itemIndex: number | null // null = solicitud de un solo activo (cancelar = cancelar la solicitud entera)
  tipo: string | null
  instrumento_nombre: string
  moneda: string | null
  monto: number | null
  cantidad: number | null
  operacion: string | null
  cancelada: boolean
}

function expandRows(rows: Solicitud[]): BlotterLine[] {
  const lines: BlotterLine[] = []
  for (const row of rows) {
    const assets = Array.isArray(row.assets_json) ? row.assets_json : []
    if (assets.length <= 1) {
      lines.push({
        row, key: row.id, itemIndex: null, tipo: row.instrumento_tipo, instrumento_nombre: row.instrumento_nombre,
        moneda: row.moneda, monto: row.monto, cantidad: row.cantidad, operacion: row.tipo_operacion,
        cancelada: row.estado === 'cancelada',
      })
    } else {
      assets.forEach((asset, i) => {
        const d = assetDisplay(asset)
        lines.push({
          row, key: `${row.id}-${i}`, itemIndex: i, tipo: d.tipo, instrumento_nombre: d.nombre,
          moneda: d.moneda, monto: d.monto, cantidad: d.cantidad, operacion: d.operacion,
          cancelada: row.estado === 'cancelada' || !!asset?.cancelada,
        })
      })
    }
  }
  return lines
}

function exportCSV(rows: Solicitud[]) {
  const headers = ['N° Interno','Fecha','Hora','Cliente','N°','Asesor','Operación','Tipo','Instrumento','Moneda','Monto ($)','Cantidad','Estado','Operador','Fecha ejecución']
  const lines = expandRows(rows).map(l => [
    l.row.solicitud_id,
    l.row.fecha_operacion,
    format(new Date(l.row.created_at), 'HH:mm'),
    l.row.client_name, l.row.client_number, l.row.asesor,
    OP_LABEL[l.operacion ?? ''] ?? l.operacion,
    l.tipo,
    l.instrumento_nombre,
    l.moneda,
    l.monto ?? '',
    l.cantidad ?? '',
    ESTADO_CFG[l.row.estado]?.label ?? l.row.estado,
    l.row.operador ?? '',
    l.row.ejecutado_at ? format(new Date(l.row.ejecutado_at), 'dd/MM/yyyy HH:mm') : '',
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
  const [selectedRow, setSelectedRow] = useState<Solicitud | null>(null)
  const [eventos, setEventos]   = useState<Evento[]>([])
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

  async function loadDetail(row: Solicitud) {
    if (row._legacy) {
      // Registros históricos: mostrar lo que tenemos sin fetch adicional
      setSelectedRow(row); setEventos([])
    } else {
      setSelectedRow(row); setEventos([])
      try {
        const res = await fetch('/api/solicitudes/' + row.id)
        const json = await res.json()
        if (json.solicitud) setSelectedRow(json.solicitud)
        setEventos(json.eventos ?? [])
      } catch { /* keep basic row data */ }
    }
  }

  async function handleAction(accion: string, extra?: Record<string,unknown>) {
    if (!selectedRow) return
    const res = await fetch('/api/solicitudes/' + selectedRow.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, ...extra }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error); return }
    await loadDetail(selectedRow)
    doFetch(0, false)
  }

  const fetchRows = useCallback(() => { doFetch(0, false) },
    [q, estado, dateFrom, dateTo, asesor, operador, tipoOp, tipoInst]) // eslint-disable-line

  useEffect(() => { fetchRows() }, [fetchRows])

  function loadMore() { doFetch(page + 1, true) }

  async function handleCancelLine(line: ReturnType<typeof expandRows>[number]) {
    const motivo = prompt('Motivo de la cancelación (opcional):') ?? ''
    if (motivo === null) return
    const res = await fetch('/api/solicitudes/' + line.row.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cancelar_item', itemIndex: line.itemIndex, motivo: motivo || undefined }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error ?? 'Error al cancelar'); return }
    doFetch(0, false)
    if (selectedRow?.id === line.row.id) loadDetail(line.row)
  }

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

      {/* Tabla + Panel detalle */}
      <div className="flex gap-3 items-start">
      <div className="flex-1 min-w-0 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {loading ? 'Cargando…' : `${rows.length}${total > rows.length ? ` de ${total}` : ''} resultado${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['N° Interno','Fecha','Hora','Cliente','Asesor','Operación','Tipo','Instrumento','Moneda','Monto ($)','Cantidad','Estado','Operador','Ejecutada',''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={15} className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados.</td></tr>
              ) : expandRows(rows).map(line => {
                const row = line.row
                const cfg = line.cancelada ? ESTADO_CFG.cancelada : (ESTADO_CFG[row.estado] ?? ESTADO_CFG.mesa_operaciones)
                const tipoCfg = TIPO_CFG[line.tipo?.toLowerCase() ?? '']
                const canCancel = isMesa && !line.cancelada && row.estado !== 'ejecutada' && !row._legacy
                return (
                  <tr key={line.key}
                    onClick={() => { if (selectedRow?.id === row.id) { setSelectedRow(null); setEventos([]) } else { loadDetail(row) } }}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedRow?.id === row.id ? 'bg-blue-50' : ''}`}>
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
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">{OP_LABEL[line.operacion ?? ''] ?? line.operacion}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {tipoCfg
                        ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tipoCfg.cls}`}>{tipoCfg.label}</span>
                        : <span className="text-xs text-gray-400">{line.tipo ?? '—'}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-800 max-w-[160px]">
                      <p className={`truncate ${line.cancelada ? 'line-through text-gray-400' : ''}`}>{line.instrumento_nombre}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{line.moneda}</td>
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                      {line.monto ? Number(line.monto).toLocaleString('es-UY') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                      {line.cantidad ? Number(line.cantidad).toLocaleString('es-UY') : '—'}
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
                    <td className="px-3 py-2 whitespace-nowrap">
                      {canCancel && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancelLine(line) }}
                          className="text-[10px] text-gray-300 hover:text-red-500 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Cargar más */}
        {hasMore && (
          <div className="flex justify-center px-4 py-3 border-t border-gray-100">
            <button onClick={loadMore} disabled={loadingMore}
              className="px-5 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-600 transition">
              {loadingMore ? 'Cargando…' : `Cargar más (${total - rows.length} restantes)`}
            </button>
          </div>
        )}
      </div>{/* fin tabla */}

      {/* Panel detalle */}
      {selectedRow && selectedRow.id && (
        <DetalleSolicitud
          sol={selectedRow}
          eventos={eventos}
          isMesa={isMesa}
          onAction={handleAction}
          onClose={() => { setSelectedRow(null); setEventos([]) }}
          onRefresh={fetchRows}
        />
      )}
      </div>{/* fin flex */}
    </div>
  )
}
