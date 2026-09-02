'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Solicitud {
  id: string
  solicitud_id: string
  asesor: string
  estado: string
  tipo_operacion: string
  instrumento_tipo: string
  instrumento_nombre: string
  clase: string | null
  moneda: string
  monto: number | null
  cantidad: number | null
  fecha_operacion: string
  client_name: string
  client_number: string
  client_email: string | null
  operador: string | null
  tomado_at: string | null
  mail_enviado_at: string | null
  ejecutado_at: string | null
  created_at: string
  cc_emails?: string[] | null
  additional_emails?: string[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets_json?: any[] | null
}

interface SolicitudDetail extends Solicitud {
  observaciones: string | null
  comision: string | null
  symbol: string | null
  cusip_isin: string | null
  precio_tipo: string | null
  precio_limite: string | null
  vigencia: string | null
  maturity: string | null
  cupon: string | null
  mail_asunto: string | null
  mail_cuerpo: string | null
  mail_preview: string | null
  assets_json: any[] | null
  precio_ejecutado: number | null
  valor_efectivo: number | null
  cancelado_at: string | null
  cancelado_motivo: string | null
}

interface Evento {
  id: string
  tipo: string
  descripcion: string
  usuario: string
  datos: any
  created_at: string
}

const ESTADO_STEPS_NEW  = ['pendiente_revision','en_revision','mail_enviado','en_ejecucion','ejecutada'] as const
const ESTADO_STEPS_OLD  = ['mesa_operaciones','mail_enviado','en_ejecucion','ejecutada'] as const

const ESTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pendiente_revision: { label: 'Pendiente de revisión', color: 'text-amber-700',  bg: 'bg-amber-100' },
  en_revision:        { label: 'En revisión',           color: 'text-blue-700',   bg: 'bg-blue-100' },
  devuelta:           { label: 'Devuelta al asesor',    color: 'text-orange-700', bg: 'bg-orange-100' },
  mesa_operaciones:   { label: 'Mesa de Operaciones',   color: 'text-amber-700',  bg: 'bg-amber-100' },
  mail_enviado:       { label: 'Mail enviado',          color: 'text-indigo-700', bg: 'bg-indigo-100' },
  en_ejecucion:       { label: 'En ejecución',          color: 'text-purple-700', bg: 'bg-purple-100' },
  ejecutada:          { label: 'Ejecutada',             color: 'text-emerald-700',bg: 'bg-emerald-100' },
  cancelada:          { label: 'Cancelada',             color: 'text-gray-500',   bg: 'bg-gray-100' },
}

const OP_LABEL: Record<string, string> = {
  compra: 'Compra', venta: 'Venta', suscripcion: 'Suscripción', rescate: 'Rescate',
}

const TIPO_BADGE: Record<string, string> = {
  fondos:   'bg-emerald-50 text-emerald-700',
  bonos:    'bg-amber-50 text-amber-700',
  acciones: 'bg-blue-50 text-blue-700',
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

// One line per asset — a solicitud with N activos must show as N separate rows
interface BlotterLine {
  row: Solicitud
  key: string
  tipo: string | null
  instrumento_nombre: string
  clase: string | null
  moneda: string | null
  monto: number | null
  cantidad: number | null
  operacion: string | null
}

function expandRows(rows: Solicitud[]): BlotterLine[] {
  const lines: BlotterLine[] = []
  for (const row of rows) {
    const assets = Array.isArray(row.assets_json) ? row.assets_json : []
    if (assets.length <= 1) {
      lines.push({
        row, key: row.id, tipo: row.instrumento_tipo, instrumento_nombre: row.instrumento_nombre,
        clase: row.clase, moneda: row.moneda, monto: row.monto, cantidad: row.cantidad, operacion: row.tipo_operacion,
      })
    } else {
      assets.forEach((asset, i) => {
        const d = assetDisplay(asset)
        lines.push({
          row, key: `${row.id}-${i}`, tipo: d.tipo, instrumento_nombre: d.nombre,
          clase: null, moneda: d.moneda, monto: d.monto, cantidad: d.cantidad, operacion: d.operacion,
        })
      })
    }
  }
  return lines
}

function ProgressBar({ estado }: { estado: string }) {
  const isNewFlow = ['pendiente_revision','en_revision','devuelta'].includes(estado)
    || (estado === 'mail_enviado' || estado === 'en_ejecucion' || estado === 'ejecutada')
  const steps = isNewFlow && !['mesa_operaciones'].includes(estado) ? ESTADO_STEPS_NEW : ESTADO_STEPS_OLD
  const idx = steps.indexOf(estado as any)
  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, i) => {
        const done = idx >= i
        return (
          <div key={step} className="flex-1 flex items-center">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${done ? 'bg-[#2D3F52]' : 'bg-gray-200'}`} />
            <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mx-0.5 transition-colors ${
              done ? 'bg-[#2D3F52] border-[#2D3F52]' : 'bg-white border-gray-300'
            } ${idx === i ? 'ring-2 ring-[#2D3F52]/30' : ''}`} />
          </div>
        )
      })}
      <div className={`h-1.5 flex-1 rounded-full ${idx >= steps.length - 1 ? 'bg-[#2D3F52]' : 'bg-gray-200'}`} />
    </div>
  )
}

const inputCls = 'border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20'

export default function BandejaMesa({ isMesa, userName }: { isMesa: boolean; userName: string }) {
  const [rows, setRows]         = useState<Solicitud[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<SolicitudDetail | null>(null)
  const [eventos, setEventos]   = useState<Evento[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  // Filtros
  const [q, setQ]             = useState('')
  const [estado, setEstado]   = useState('')
  const [dateFrom, setDateFrom] = useState('')

  // Email modal
  const [showEmail, setShowEmail]   = useState(false)
  const [emailAsunto, setEmailAsunto] = useState('')
  const [emailCuerpo, setEmailCuerpo] = useState('')
  const [emailTo, setEmailTo]       = useState('')
  const [emailCc, setEmailCc]       = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Ejecutar modal
  const [showEjecucion, setShowEjecucion] = useState(false)
  const [precioEj, setPrecioEj] = useState('')
  const [valorEf, setValorEf]   = useState('')

  // Cancelar modal
  const [showCancelar, setShowCancelar] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)       params.set('q', q)
    if (estado)  params.set('estado', estado)
    if (dateFrom) params.set('dateFrom', dateFrom)
    const res = await fetch('/api/solicitudes?' + params)
    const json = await res.json()
    setRows(json.solicitudes ?? [])
    setLoading(false)
  }, [q, estado, dateFrom])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function loadDetail(id: string) {
    const res = await fetch('/api/solicitudes/' + id)
    const json = await res.json()
    const sol = json.solicitud as SolicitudDetail
    setSelected(sol)
    setEventos(json.eventos ?? [])
    setEmailTo([sol.client_email, ...(sol.additional_emails ?? [])].filter(Boolean).join(', '))
    setEmailCc((sol.cc_emails ?? []).join(', '))
    // Pre-fill email: prefer pre-generated preview from asesor
    if (sol.mail_preview) {
      setEmailCuerpo(sol.mail_preview)
      setEmailAsunto(sol.mail_asunto ?? `Confirmacion de orden - ${sol.client_number ?? sol.client_name} - ${sol.fecha_operacion}`)
    } else if (sol.mail_asunto) {
      setEmailAsunto(sol.mail_asunto)
      if (sol.mail_cuerpo) setEmailCuerpo(sol.mail_cuerpo)
      else generarEmailTexto(sol)
    } else {
      generarEmailTexto(sol)
    }
  }

  function generarEmailTexto(sol: SolicitudDetail) {
    const op = OP_LABEL[sol.tipo_operacion] ?? sol.tipo_operacion
    const asunto = `Confirmación de ${op} — ${sol.instrumento_nombre} — ${sol.client_name}`
    const lines = [
      `Estimado/a ${sol.client_name},`,
      '',
      `Le confirmamos la siguiente instrucción de operación:`,
      '',
      `  Tipo:         ${op}`,
      `  Instrumento:  ${sol.instrumento_nombre}${sol.clase ? ` (${sol.clase})` : ''}`,
      sol.moneda && sol.monto     ? `  Monto:        ${sol.moneda} ${Number(sol.monto).toLocaleString('es-UY')}` : '',
      sol.cantidad                 ? `  Cantidad:     ${sol.cantidad}` : '',
      sol.cusip_isin               ? `  ISIN/CUSIP:   ${sol.cusip_isin}` : '',
      sol.maturity                 ? `  Vencimiento:  ${sol.maturity}` : '',
      sol.cupon                    ? `  Cupón:        ${sol.cupon}%` : '',
      sol.precio_tipo === 'limite' ? `  Precio:       Límite ${sol.precio_limite}` : '',
      sol.precio_tipo === 'stop'   ? `  Precio:       Stop ${sol.precio_limite}` : '',
      `  Moneda:       ${sol.moneda}`,
      `  Fecha:        ${sol.fecha_operacion}`,
      '',
      `N° de cuenta: ${sol.client_number}`,
      '',
      sol.observaciones || '',
      '',
      'Ante cualquier consulta, no dude en comunicarse.',
      '',
      'Saludos,',
      'Mesa de Operaciones | Roble Capital',
    ].filter(l => l !== undefined)
    setEmailAsunto(asunto)
    setEmailCuerpo(lines.join('\n'))
  }

  async function patch(accion: string, extra: Record<string, any> = {}) {
    if (!selected) return
    setActionLoading(true)
    const res = await fetch('/api/solicitudes/' + selected.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, ...extra }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) { alert(json.error); return }
    await loadDetail(selected.id)
    fetchRows()
    return json
  }

  async function handleTomar() { await patch('tomar') }

  async function handleGenerarEmail() {
    await patch('generar_email', { asunto: emailAsunto, cuerpo: emailCuerpo })
    setShowEmail(true)
  }

  function parseList(field: string): string[] {
    return field.split(',').map(e => e.trim()).filter(Boolean)
  }
  function toggleInTo(email: string) {
    const list = parseList(emailTo)
    setEmailTo(list.includes(email) ? list.filter(e => e !== email).join(', ') : [...list, email].join(', '))
    const ccList = parseList(emailCc)
    if (!list.includes(email) && ccList.includes(email)) setEmailCc(ccList.filter(e => e !== email).join(', '))
  }
  function toggleInCc(email: string) {
    const list = parseList(emailCc)
    setEmailCc(list.includes(email) ? list.filter(e => e !== email).join(', ') : [...list, email].join(', '))
  }

  async function handleEnviarEmail() {
    setSendingEmail(true)
    const to = parseList(emailTo)
    const cc = parseList(emailCc)
    // Send via Gmail API (reuse existing endpoint)
    const res = await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to.length > 1 ? to : (to[0] ?? selected!.client_email),
        cc: cc.length > 0 ? cc : undefined,
        subject: emailAsunto,
        body: emailCuerpo,
        client_name: selected!.client_name,
        client_number: selected!.client_number,
        viaMesa: true,
      }),
    })
    if (res.ok) {
      await patch('mail_enviado', { asunto: emailAsunto, cuerpo: emailCuerpo })
      setShowEmail(false)
    } else {
      const j = await res.json()
      alert('Error al enviar: ' + (j.error ?? 'desconocido'))
    }
    setSendingEmail(false)
  }

  async function handleEnEjecucion() { await patch('en_ejecucion') }

  async function handleEjecutar() {
    await patch('ejecutar', {
      precio_ejecutado: precioEj ? Number(precioEj) : null,
      valor_efectivo:   valorEf  ? Number(valorEf)  : null,
    })
    setShowEjecucion(false)
    setPrecioEj(''); setValorEf('')
  }

  async function handleCancelar() {
    await patch('cancelar', { motivo: motivoCancel })
    setShowCancelar(false)
    setMotivoCancel('')
  }

  const kpis = {
    pendiente:    rows.filter(r => ['mesa_operaciones','pendiente_revision','devuelta'].includes(r.estado)).length,
    en_revision:  rows.filter(r => r.estado === 'en_revision').length,
    mail_enviado: rows.filter(r => r.estado === 'mail_enviado').length,
    en_ejecucion: rows.filter(r => r.estado === 'en_ejecucion').length,
    ejecutada:    rows.filter(r => r.estado === 'ejecutada').length,
  }

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Pendiente',    val: kpis.pendiente,    color: 'text-amber-700',   bg: 'bg-amber-50' },
          { label: 'En revisión',  val: kpis.en_revision,  color: 'text-blue-700',    bg: 'bg-blue-50' },
          { label: 'Mail enviado', val: kpis.mail_enviado, color: 'text-indigo-700',  bg: 'bg-indigo-50' },
          { label: 'En ejecución', val: kpis.en_ejecucion, color: 'text-purple-700',  bg: 'bg-purple-50' },
          { label: 'Ejecutadas',   val: kpis.ejecutada,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-lg px-4 py-3`}>
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" placeholder="Buscar cliente, instrumento…" value={q}
          onChange={e => setQ(e.target.value)} className={inputCls + ' flex-1 min-w-[180px]'} />
        <select value={estado} onChange={e => setEstado(e.target.value)} className={inputCls}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        <button onClick={fetchRows} className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50">↻ Actualizar</button>
      </div>

      {/* Layout: tabla + panel */}
      <div className="flex gap-4 min-h-[500px]">

        {/* Tabla */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No hay solicitudes.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['ID','Cliente','Asesor','Operación','Instrumento','Monto','Estado','Operador'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expandRows(rows).map(line => {
                    const row = line.row
                    const cfg = ESTADO_CFG[row.estado] ?? ESTADO_CFG.mesa_operaciones
                    const isSelected = selected?.id === row.id
                    return (
                      <tr
                        key={line.key}
                        onClick={() => loadDetail(row.id)}
                        className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500 whitespace-nowrap">{row.solicitud_id}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <p className="font-medium text-gray-800">{row.client_name}</p>
                          <p className="text-[11px] text-gray-400">#{row.client_number}</p>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{row.asesor}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-gray-700">{OP_LABEL[line.operacion ?? ''] ?? line.operacion}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-gray-800 truncate max-w-[160px]">{line.instrumento_nombre}</p>
                          {line.clase && <p className="text-[11px] text-gray-400">{line.clase}</p>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                          {line.monto ? `${line.moneda} ${Number(line.monto).toLocaleString('es-UY')}` : line.cantidad ? `${line.cantidad} uds` : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{row.operador ?? <span className="text-gray-300">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de detalle */}
        {selected && (
          <div className="w-80 shrink-0 bg-white rounded-lg border border-gray-200 overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-gray-400">{selected.solicitud_id}</p>
                <p className="font-semibold text-gray-800 mt-0.5">{selected.client_name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Barra de progreso */}
            {selected.estado !== 'cancelada' && selected.estado !== 'devuelta' && (
              <div className="px-4 py-3 border-b border-gray-100">
                <ProgressBar estado={selected.estado} />
              </div>
            )}
            {selected.estado === 'devuelta' && (
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded-full">↩ Devuelta al asesor</span>
              </div>
            )}

            {/* Datos */}
            <div className="px-4 py-3 space-y-2 border-b border-gray-100 text-sm">
              {[
                ['De', 'trading@roblecapital.net'],
                selected.client_email || (selected.cc_emails?.length ?? 0) > 0
                  ? ['Para', [selected.client_email, ...(selected.cc_emails ?? [])].filter(Boolean).join(', ')]
                  : null,
                ['Operación', `${OP_LABEL[selected.tipo_operacion]} · ${selected.instrumento_tipo}`],
                ['Instrumento', selected.instrumento_nombre],
                selected.clase ? ['Clase', selected.clase] : null,
                ['Moneda', selected.moneda],
                selected.monto    ? ['Monto', `${selected.moneda} ${Number(selected.monto).toLocaleString('es-UY')}`] : null,
                selected.cantidad ? ['Cantidad', String(selected.cantidad)] : null,
                ['Fecha', selected.fecha_operacion],
                selected.cusip_isin ? ['ISIN/CUSIP', selected.cusip_isin] : null,
                selected.maturity   ? ['Vencimiento', selected.maturity]   : null,
                selected.cupon      ? ['Cupón', selected.cupon + '%']      : null,
                ['Asesor', selected.asesor],
                selected.operador   ? ['Operador', selected.operador]      : null,
                selected.comision   ? ['Comisión', selected.comision]      : null,
              ].filter(Boolean).map((entry) => {
                const [label, value] = entry as [string, string]
                return (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-xs text-gray-400 shrink-0">{label}</span>
                    <span className="text-xs text-gray-800 text-right">{value}</span>
                  </div>
                )
              })}
              {selected.observaciones && (
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Observaciones</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{selected.observaciones}</p>
                </div>
              )}
            </div>

            {/* Acciones — solo Mesa */}
            {isMesa && selected.estado !== 'cancelada' && selected.estado !== 'ejecutada' && (
              <div className="px-4 py-3 space-y-2 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Acciones</p>

                {/* Tomar: when not yet taken and in a takeable state */}
                {!selected.operador && !['mail_enviado','en_ejecucion','ejecutada'].includes(selected.estado) && (
                  <button onClick={handleTomar} disabled={actionLoading}
                    className="w-full py-2 text-sm font-medium bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-50">
                    Tomar solicitud
                  </button>
                )}

                {/* Send email: for old flow (mesa_operaciones + operador) or new flow (en_revision) */}
                {selected.operador && (selected.estado === 'mesa_operaciones' || selected.estado === 'en_revision') && (
                  <div className="flex gap-1.5">
                    <button onClick={async () => {
                      setSendingEmail(true)
                      const to = [selected.client_email, ...(selected.additional_emails ?? [])].filter(Boolean)
                      const res = await fetch('/api/gmail/send', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to: to.length > 1 ? to : selected.client_email,
                          cc: (selected.cc_emails?.length ?? 0) > 0 ? selected.cc_emails : undefined,
                          subject: emailAsunto, body: emailCuerpo,
                          client_name: selected.client_name, client_number: selected.client_number, viaMesa: true }),
                      })
                      if (res.ok) { await patch('mail_enviado', { asunto: emailAsunto, cuerpo: emailCuerpo }) }
                      else { const j = await res.json(); alert(j.error ?? 'Error al enviar') }
                      setSendingEmail(false)
                    }} disabled={actionLoading || sendingEmail}
                      className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {sendingEmail ? 'Enviando…' : 'Enviar directo'}
                    </button>
                    <button onClick={() => setShowEmail(true)} disabled={actionLoading || sendingEmail}
                      className="flex-1 py-2 text-sm font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                      Editar y enviar
                    </button>
                  </div>
                )}

                {/* Devolver: only for new flow */}
                {selected.estado === 'en_revision' && (
                  <button onClick={async () => {
                    const motivo = prompt('Motivo (opcional):') ?? ''
                    await patch('devolver', { motivo })
                  }} disabled={actionLoading}
                    className="w-full py-2 text-sm font-medium border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50">
                    Devolver al asesor
                  </button>
                )}

                {selected.estado === 'mail_enviado' && (
                  <button onClick={handleEnEjecucion} disabled={actionLoading}
                    className="w-full py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    Marcar en ejecución
                  </button>
                )}

                {(selected.estado === 'mail_enviado' || selected.estado === 'en_ejecucion') && (
                  <button onClick={() => setShowEjecucion(true)}
                    className="w-full py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                    Marcar como ejecutada
                  </button>
                )}

                <button onClick={() => setShowCancelar(true)}
                  className="w-full py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                  Cancelar solicitud
                </button>
              </div>
            )}

            {/* Historial */}
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Historial</p>
              {eventos.length === 0 ? (
                <p className="text-xs text-gray-400">Sin eventos.</p>
              ) : (
                <ul className="space-y-2">
                  {eventos.map(ev => (
                    <li key={ev.id} className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-700">{ev.descripcion}</p>
                        <p className="text-[10px] text-gray-400">
                          {format(new Date(ev.created_at), "d MMM HH:mm", { locale: es })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: generar / enviar email */}
      {showEmail && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Email para el cliente</h2>
              <button onClick={() => setShowEmail(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Para</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="email1@cliente.com, email2@cliente.com"
                  value={emailTo} onChange={e => setEmailTo(e.target.value)} />
                {(() => {
                  const known = Array.from(new Set([selected.client_email, ...(selected.additional_emails ?? [])].filter(Boolean))) as string[]
                  return known.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wide">Emails del cliente:</span>
                      {known.map(e => {
                        const isTo = parseList(emailTo).includes(e)
                        const isCc = parseList(emailCc).includes(e)
                        return (
                          <span key={e} className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => toggleInTo(e)} title="Para"
                              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                isTo ? 'bg-[#2D3F52] text-white border-[#2D3F52]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                              }`}>
                              {e}
                            </button>
                            {!isTo && (
                              <button type="button" onClick={() => toggleInCc(e)} title={isCc ? 'Quitar de CC' : 'Agregar como CC'}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                                  isCc ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-400 border-gray-200 hover:border-blue-200 hover:text-blue-600'
                                }`}>
                                {isCc ? '✓ CC' : '+ CC'}
                              </button>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CC</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="email1@roble.com, email2@roble.com"
                  value={emailCc} onChange={e => setEmailCc(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Asunto</label>
                <input type="text" className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={emailAsunto} onChange={e => setEmailAsunto(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cuerpo</label>
                <textarea rows={14} className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
                  value={emailCuerpo} onChange={e => setEmailCuerpo(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400">Revisá el correo antes de enviarlo. Una vez enviado se registra en el historial.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowEmail(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleEnviarEmail} disabled={sendingEmail}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {sendingEmail ? 'Enviando…' : 'Enviar al cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ejecutar */}
      {showEjecucion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Marcar como ejecutada</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Precio ejecutado (opcional)</label>
                <input type="number" step="0.01" className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none"
                  value={precioEj} onChange={e => setPrecioEj(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valor efectivo (opcional)</label>
                <input type="number" step="0.01" className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none"
                  value={valorEf} onChange={e => setValorEf(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowEjecucion(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleEjecutar} disabled={actionLoading}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                Confirmar ejecución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cancelar */}
      {showCancelar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Cancelar solicitud</h2>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Motivo (opcional)</label>
              <textarea rows={3} className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none"
                value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} placeholder="Motivo de la cancelación…" />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowCancelar(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Volver</button>
              <button onClick={handleCancelar} disabled={actionLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
