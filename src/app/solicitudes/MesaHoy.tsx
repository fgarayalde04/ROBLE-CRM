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
  observaciones?: string | null
  comision?: string | null
  cusip_isin?: string | null
  maturity?: string | null
  cupon?: string | null
  mail_asunto?: string | null
  mail_cuerpo?: string | null
  mail_preview?: string | null
  assets_json?: any[] | null
  precio_ejecutado?: number | null
  valor_efectivo?: number | null
  precio_tipo?: string | null
  precio_limite?: string | null
  vigencia?: string | null
  symbol?: string | null
  canal?: string | null
  opera_asesor?: boolean | null
  cc_emails?: string[] | null
  additional_emails?: string[] | null
}

interface Evento {
  id: string; tipo: string; descripcion: string
  usuario: string; datos: unknown; created_at: string
}

const ESTADO_STEPS_NEW = ['pendiente_revision','en_revision','mail_enviado','en_ejecucion','ejecutada'] as const
const ESTADO_STEPS_OLD = ['mesa_operaciones','mail_enviado','en_ejecucion','ejecutada'] as const
const ESTADO_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pendiente_revision: { label:'Pendiente revisión', color:'text-amber-700',   bg:'bg-amber-50',   dot:'bg-amber-400' },
  en_revision:        { label:'En revisión',        color:'text-blue-700',    bg:'bg-blue-50',    dot:'bg-blue-400' },
  devuelta:           { label:'Devuelta',            color:'text-orange-700',  bg:'bg-orange-50',  dot:'bg-orange-400' },
  mesa_operaciones:   { label:'Mesa de Operaciones', color:'text-amber-700',   bg:'bg-amber-50',   dot:'bg-amber-400' },
  mail_enviado:       { label:'Mail enviado',        color:'text-indigo-700',  bg:'bg-indigo-50',  dot:'bg-indigo-400' },
  en_ejecucion:       { label:'En ejecución',        color:'text-purple-700',  bg:'bg-purple-50',  dot:'bg-purple-400' },
  ejecutada:          { label:'Ejecutada',           color:'text-emerald-700', bg:'bg-emerald-50', dot:'bg-emerald-500' },
  cancelada:          { label:'Cancelada',           color:'text-gray-400',    bg:'bg-gray-50',    dot:'bg-gray-300' },
}
const OP_LABEL: Record<string,string> = { compra:'Compra',venta:'Venta',suscripcion:'Compra',rescate:'Venta' }

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
        moneda: row.moneda, monto: row.monto, cantidad: row.cantidad, operacion: row.tipo_operacion,
      })
    } else {
      assets.forEach((asset, i) => {
        const d = assetDisplay(asset)
        lines.push({
          row, key: `${row.id}-${i}`, tipo: d.tipo, instrumento_nombre: d.nombre,
          moneda: d.moneda, monto: d.monto, cantidad: d.cantidad, operacion: d.operacion,
        })
      })
    }
  }
  return lines
}

function ProgressBar({ estado }: { estado: string }) {
  if (estado === 'cancelada') return <span className="text-xs text-gray-400 italic">Cancelada</span>
  if (estado === 'devuelta')  return <span className="text-xs text-orange-600 font-medium">↩ Devuelta al asesor</span>
  const steps = ['mesa_operaciones'].includes(estado) ? ESTADO_STEPS_OLD : ESTADO_STEPS_NEW
  const idx = steps.indexOf(estado as any)
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

function DetailPanel({
  sol, eventos, isMesa, onAction, onClose
}: {
  sol: Solicitud; eventos: Evento[]; isMesa: boolean
  onAction: (accion: string, extra?: Record<string,unknown>) => Promise<void>
  onClose: () => void
}) {
  const [emailAsunto, setEmailAsunto] = useState(sol.mail_asunto ?? '')
  const [emailCuerpo, setEmailCuerpo] = useState(sol.mail_cuerpo ?? '')
  const [emailTo, setEmailTo]         = useState([sol.client_email, ...(sol.additional_emails ?? [])].filter(Boolean).join(', '))
  const [emailCc, setEmailCc]         = useState((sol.cc_emails ?? []).join(', '))
  const [showEmail, setShowEmail]     = useState(false)
  const [showEjecutar, setShowEjecutar] = useState(false)
  const [showCancelar, setShowCancelar] = useState(false)
  const [precio, setPrecio]           = useState('')
  const [valor, setValor]             = useState('')
  const [motivo, setMotivo]           = useState('')
  const [sendingMail, setSendingMail] = useState(false)
  const [busy, setBusy]               = useState(false)

  useEffect(() => {
    // Prefer pre-generated preview from asesor
    if (sol.mail_preview) {
      setEmailCuerpo(sol.mail_preview)
      setEmailAsunto(sol.mail_asunto ?? `Confirmacion de orden - ${sol.client_number ?? sol.client_name} - ${sol.fecha_operacion}`)
    } else if (sol.mail_cuerpo) {
      setEmailCuerpo(sol.mail_cuerpo)
      if (sol.mail_asunto) setEmailAsunto(sol.mail_asunto)
    } else {
      const op = OP_LABEL[sol.tipo_operacion] ?? sol.tipo_operacion
      const lines = [
        `Estimado/a ${sol.client_name},`,
        '',
        `Le confirmamos la siguiente instrucción de operación:`,
        '',
        `  Tipo:         ${op}`,
        `  Instrumento:  ${sol.instrumento_nombre}${sol.clase ? ` (${sol.clase})` : ''}`,
        sol.monto    ? `  Monto:        ${sol.moneda} ${Number(sol.monto).toLocaleString('es-UY')}` : '',
        sol.cantidad ? `  Cantidad:     ${sol.cantidad}` : '',
        sol.cusip_isin ? `  ISIN/CUSIP:   ${sol.cusip_isin}` : '',
        sol.maturity  ? `  Vencimiento:  ${sol.maturity}` : '',
        sol.cupon     ? `  Cupón:        ${sol.cupon}%` : '',
        `  Moneda:       ${sol.moneda}`,
        `  Fecha:        ${sol.fecha_operacion}`,
        '',
        `N° de cuenta: ${sol.client_number}`,
        '',
        sol.observaciones ?? '',
        '',
        'Saludos,',
        'Mesa de Operaciones | Roble Capital',
      ].filter(l => l !== undefined)
      setEmailAsunto(`Confirmación de ${op} — ${sol.instrumento_nombre} — ${sol.client_name}`)
      setEmailCuerpo(lines.join('\n'))
    }
  }, [sol.id])

  async function act(accion: string, extra?: Record<string,unknown>) {
    setBusy(true); await onAction(accion, extra); setBusy(false)
  }

  async function handleEnviarEmail() {
    setSendingMail(true)
    await onAction('generar_email', { asunto: emailAsunto, cuerpo: emailCuerpo })
    const to = emailTo.split(',').map(e => e.trim()).filter(Boolean)
    const cc = emailCc.trim() || undefined
    const res = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.length > 1 ? to : (to[0] ?? sol.client_email), cc, subject: emailAsunto, body: emailCuerpo,
        client_name: sol.client_name, client_number: sol.client_number }),
    })
    const data = await res.json()
    if (res.ok) {
      await onAction('mail_enviado', { asunto: emailAsunto, cuerpo: emailCuerpo, mail_thread_id: data.thread_id ?? null, mail_message_id: data.message_id ?? null })
      setShowEmail(false)
    } else { alert(data.error ?? 'Error al enviar') }
    setSendingMail(false)
  }

  const cfg = ESTADO_CFG[sol.estado] ?? ESTADO_CFG.mesa_operaciones
  const canAct = isMesa && sol.estado !== 'cancelada' && sol.estado !== 'ejecutada'

  return (
    <div className="w-full md:w-80 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-gray-400">{sol.solicitud_id}</p>
          <p className="font-semibold text-gray-800 truncate">{sol.client_name}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl shrink-0">×</button>
      </div>

      {/* Progress */}
      {sol.estado !== 'cancelada' && (
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
          ['Operación', `${OP_LABEL[sol.tipo_operacion] ?? sol.tipo_operacion} · ${sol.instrumento_tipo}`],
          ['Instrumento', sol.instrumento_nombre],
          sol.clase ? ['Clase', sol.clase] : null,
          ['Moneda', sol.moneda],
          sol.monto    ? ['Monto', `${sol.moneda} ${Number(sol.monto).toLocaleString('es-UY')}`] : null,
          sol.cantidad ? ['Cantidad', String(sol.cantidad)] : null,
          ['Fecha', sol.fecha_operacion],
          sol.cusip_isin ? ['ISIN/CUSIP', sol.cusip_isin] : null,
          sol.maturity   ? ['Vencimiento', sol.maturity]   : null,
          sol.cupon      ? ['Cupón', sol.cupon + '%']       : null,
          ['Asesor', sol.asesor],
          sol.canal ? ['Canal', sol.canal === 'directo_asesor' ? 'Envío directo por asesor' : sol.canal === 'directo_mesa' ? 'Envío directo por Mesa' : 'Derivada a Mesa'] : null,
          ['Opera', sol.opera_asesor ? 'Asesor' : 'Mesa'],
          sol.operador  ? ['Operador', sol.operador]        : null,
          sol.precio_ejecutado ? ['Precio ejec.', String(sol.precio_ejecutado)] : null,
          sol.valor_efectivo   ? ['Valor ef.', `${sol.moneda} ${Number(sol.valor_efectivo).toLocaleString('es-UY')}`] : null,
          sol.comision  ? ['Comisión', sol.comision]        : null,
        ] as ([string,string]|null)[]).filter(Boolean).map((entry) => { const [label,value] = entry as [string,string]; return (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
            <span className="text-[11px] text-gray-800 text-right">{value}</span>
          </div>
        )})}
        {sol.observaciones && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-0.5">Observaciones</p>
            <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{sol.observaciones}</p>
          </div>
        )}
      </div>

      {/* Acciones Mesa */}
      {canAct && (
        <div className="px-4 py-3 space-y-1.5 border-b border-gray-100">
          {!sol.operador && !['mail_enviado','en_ejecucion','ejecutada'].includes(sol.estado) && (
            <button onClick={() => act('tomar')} disabled={busy}
              className="w-full py-2 text-xs font-semibold bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-50">
              Tomar solicitud
            </button>
          )}
          {sol.operador && (sol.estado === 'mesa_operaciones' || sol.estado === 'en_revision') && (
            <div className="flex gap-1.5">
              <button onClick={async () => {
                setSendingMail(true)
                await onAction('generar_email', { asunto: emailAsunto, cuerpo: emailCuerpo })
                const cc = sol.cc_emails?.filter(Boolean).join(', ') || undefined
                const to = [sol.client_email, ...(sol.additional_emails ?? [])].filter(Boolean) as string[]
                const res = await fetch('/api/gmail/send', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: to.length > 1 ? to : sol.client_email, cc, subject: emailAsunto, body: emailCuerpo,
                    client_name: sol.client_name, client_number: sol.client_number }),
                })
                const data = await res.json()
                if (res.ok) { await onAction('mail_enviado', { asunto: emailAsunto, cuerpo: emailCuerpo, mail_thread_id: data.thread_id ?? null, mail_message_id: data.message_id ?? null }) }
                else { alert(data.error ?? 'Error al enviar') }
                setSendingMail(false)
              }} disabled={sendingMail}
                className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {sendingMail ? 'Enviando…' : 'Enviar directo'}
              </button>
              <button onClick={() => setShowEmail(true)} disabled={sendingMail}
                className="flex-1 py-2 text-xs font-semibold border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                Editar y enviar
              </button>
            </div>
          )}
          {sol.estado === 'en_revision' && (
            <button onClick={async () => {
              const motivo = prompt('Motivo para devolver (opcional):') ?? ''
              await act('devolver', { motivo })
            }} disabled={busy}
              className="w-full py-2 text-xs font-semibold border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50">
              Devolver al asesor
            </button>
          )}
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
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Historial</p>
        {eventos.length === 0 ? <p className="text-xs text-gray-400">Sin eventos.</p> : (
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

      {/* Modal email */}
      {showEmail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Email para {sol.client_name}</h2>
              <button onClick={() => setShowEmail(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Para</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="email1@cliente.com, email2@cliente.com"
                  value={emailTo} onChange={e => setEmailTo(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CC</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="email1@roble.com, email2@roble.com"
                  value={emailCc} onChange={e => setEmailCc(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Asunto</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={emailAsunto} onChange={e => setEmailAsunto(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cuerpo — revisá antes de enviar</label>
                <textarea rows={14} className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
                  value={emailCuerpo} onChange={e => setEmailCuerpo(e.target.value)} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowEmail(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleEnviarEmail} disabled={sendingMail}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {sendingMail ? 'Enviando…' : 'Enviar al cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ejecutar */}
      {showEjecutar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Confirmar ejecución</h2>
            </div>
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
              <button onClick={async () => { await act('ejecutar', { precio_ejecutado: precio||null, valor_efectivo: valor||null }); setShowEjecutar(false) }}
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
              <button onClick={async () => { await act('cancelar', { motivo }); setShowCancelar(false) }}
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

export default function MesaHoy({ isMesa, userName, openId }: { isMesa: boolean; userName: string; openId?: string | null }) {
  const [rows, setRows]         = useState<Solicitud[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<Solicitud | null>(null)
  const [eventos, setEventos]   = useState<Evento[]>([])
  const [verSolo, setVerSolo]   = useState<'hoy' | 'semana' | 'todo'>('todo')

  // Fecha en hora Uruguay (UTC-3)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (verSolo === 'hoy') {
      p.set('dateFrom', today); p.set('dateTo', today)
    } else if (verSolo === 'semana') {
      const from = new Date()
      from.setDate(from.getDate() - 7)
      p.set('dateFrom', from.toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' }))
    }
    const res = await fetch('/api/solicitudes?' + p)
    const json = await res.json()
    setRows(json.solicitudes ?? [])
    setLoading(false)
  }, [today, verSolo])

  useEffect(() => { fetchRows() }, [fetchRows])

  // Llegamos acá desde una notificación (?open=ID) — abrir esa orden directamente.
  useEffect(() => {
    if (openId) loadDetail(openId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  async function loadDetail(id: string) {
    const res = await fetch('/api/solicitudes/' + id)
    const json = await res.json()
    setSelected(json.solicitud)
    setEventos(json.eventos ?? [])
  }

  async function handleAction(accion: string, extra?: Record<string,unknown>) {
    if (!selected) return
    const res = await fetch('/api/solicitudes/' + selected.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, ...extra }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error); return }
    await loadDetail(selected.id)
    fetchRows()
  }

  const kpis = [
    { label: 'Pendiente',    val: rows.filter(r => ['mesa_operaciones','pendiente_revision','en_revision','devuelta'].includes(r.estado)).length, color:'text-amber-700',  bg:'bg-amber-50' },
    { label: 'Mail enviado', val: rows.filter(r => ['mail_enviado','en_ejecucion'].includes(r.estado)).length,    color:'text-indigo-700', bg:'bg-indigo-50' },
    { label: 'Ejecutadas',   val: rows.filter(r => r.estado === 'ejecutada').length,       color:'text-emerald-700',bg:'bg-emerald-50' },
  ]

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map(k => (
          <div key={k.label} className={`${k.bg} rounded-lg px-3 py-2.5`}>
            <p className="text-[10px] text-gray-500">{k.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Tabla + Panel detalle — apilados en mobile, lado a lado en desktop */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Tabla */}
        <div className="flex-1 min-w-0 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
              {rows.length} solicitud{rows.length !== 1 ? 'es' : ''}
            </p>
            <div className="flex items-center gap-1">
              {(['hoy','semana','todo'] as const).map(v => (
                <button key={v} onClick={() => setVerSolo(v)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                    verSolo === v ? 'bg-[#2D3F52] text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  {v === 'hoy' ? 'Hoy' : v === 'semana' ? '7 días' : 'Todo'}
                </button>
              ))}
              <button onClick={fetchRows} className="ml-1 text-xs text-blue-500 hover:underline">↻</button>
            </div>
          </div>
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No hay solicitudes {verSolo === 'hoy' ? 'para hoy' : verSolo === 'semana' ? 'en los últimos 7 días' : ''}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Hora','Cliente','Asesor','Operación','Instrumento','Monto ($)','Cantidad','Estado','Operador'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expandRows(rows).map(line => {
                    const row = line.row
                    const cfg = ESTADO_CFG[row.estado] ?? ESTADO_CFG.mesa_operaciones
                    return (
                      <tr key={line.key} onClick={() => loadDetail(row.id)}
                        className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${selected?.id === row.id ? 'bg-blue-50' : ''}`}>
                        <td className="px-3 py-2 text-[11px] text-gray-400 whitespace-nowrap">
                          {format(new Date(row.created_at), 'HH:mm')}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="font-medium text-gray-800 text-xs">{row.client_name}</p>
                          <p className="text-[10px] text-gray-400">#{row.client_number}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{row.asesor}</td>
                        <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                          {OP_LABEL[line.operacion ?? ''] ?? line.operacion}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs text-gray-800 truncate max-w-[140px]">{line.instrumento_nombre}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {line.tipo && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#2D3F52]/10 text-[#2D3F52]">
                                {line.tipo}
                              </span>
                            )}
                            {row.clase && <span className="text-[10px] text-gray-400">{row.clase}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                          {line.monto ? `${line.moneda} ${Number(line.monto).toLocaleString('es-UY')}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap font-mono tabular-nums text-right">
                          {line.cantidad ? Number(line.cantidad).toLocaleString('es-UY') : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.operador ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel detalle */}
        {selected && (
          <DetailPanel
            sol={selected} eventos={eventos}
            isMesa={isMesa}
            onAction={handleAction}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
