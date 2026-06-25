'use client'

import { useState, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import LegajosSearchInput from '@/components/LegajosSearchInput'
import InstrumentSearch from '@/components/InstrumentSearch'
import TradingEmailSearch from '@/components/TradingEmailSearch'
import InstrumentsManager from './InstrumentsManager'
import BlotterTable from './BlotterTable'
import type { Instrument } from '@/app/api/instruments/route'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderType = 'acciones' | 'fondos' | 'bonos'
type Tab = 'nueva' | 'blotter' | 'mesa' | 'mis-ordenes' | 'instrumentos'

interface AccionesBlock {
  type: 'acciones'; id: string; nombre: string; ticker: string
  cantidad: string; cantidadTipo: 'acciones' | 'monto'
  precio: 'mercado' | 'limite'; precioLimite: string
  moneda: string; operacion: 'compra' | 'venta'; fecha: string; observaciones: string
  vigencia: 'DIA' | 'GTC'; comision: string
}
interface FondosBlock {
  type: 'fondos'; id: string; fondo: string; cusipIsin: string
  fecha: string; operacion: 'compra' | 'venta'; monto: string; moneda: string; observaciones: string
  vigencia: 'DIA' | 'GTC'; comision: string; clase: 'Acumulativa' | 'Distributiva'
}
interface BonosBlock {
  type: 'bonos'; id: string; descripcion: string; cusipIsin: string
  cantidad: string; precio: 'mercado' | 'limite'; precioLimite: string
  moneda: string; operacion: 'compra' | 'venta'; fecha: string; observaciones: string
  vigencia: 'DIA' | 'GTC'; comision: string
}
type OrderBlock = AccionesBlock | FondosBlock | BonosBlock

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function uid() { return Math.random().toString(36).slice(2, 9) }

function newAcciones(id: string): AccionesBlock {
  return { type: 'acciones', id, nombre: '', ticker: '', cantidad: '', cantidadTipo: 'acciones', precio: 'mercado', precioLimite: '', moneda: 'USD', operacion: 'compra', fecha: todayStr(), observaciones: '', vigencia: 'DIA', comision: '' }
}
function newFondos(id: string): FondosBlock {
  return { type: 'fondos', id, fondo: '', cusipIsin: '', fecha: todayStr(), operacion: 'compra', monto: '', moneda: 'USD', observaciones: '', vigencia: 'DIA', comision: '', clase: 'Acumulativa' }
}
function newBonos(id: string): BonosBlock {
  return { type: 'bonos', id, descripcion: '', cusipIsin: '', cantidad: '', precio: 'mercado', precioLimite: '', moneda: 'USD', operacion: 'compra', fecha: todayStr(), observaciones: '', vigencia: 'DIA', comision: '' }
}


const TRADING_EMAIL = 'trading@roblecapital.net'

function generateEmailText(blocks: OrderBlock[], clientName: string, clientNumber: string, fecha: string): string {
  if (!blocks.length) return ''
  const lines: string[] = []
  lines.push(`Estimado,`)
  lines.push(``)
  lines.push(`De acuerdo a lo conversado, le pido que nos confirme la siguiente operación.`)
  lines.push(``)
  lines.push(`Muchas gracias,`)
  lines.push(``)
  lines.push(`─────────────────────────────────────────`)
  lines.push(``)
  blocks.forEach((block, idx) => {
    lines.push(`ORDEN ${idx + 1} — ${block.type === 'acciones' ? 'RENTA VARIABLE (ACCIONES)' : block.type === 'fondos' ? 'FONDO DE INVERSIÓN' : 'RENTA FIJA (BONO)'}`)
    lines.push(``)
    if (block.type === 'acciones') {
      lines.push(`  Operación:   ${block.operacion === 'compra' ? 'Compra' : 'Venta'}`)
      lines.push(`  Acción:      ${block.nombre || '—'}`)
      lines.push(`  Ticker:      ${block.ticker || '—'}`)
      const cantLabel = block.cantidadTipo === 'acciones' ? 'acciones' : block.moneda
      lines.push(`  Cantidad:    ${block.cantidad || '—'} ${cantLabel}`)
      lines.push(`  Precio:      ${block.precio === 'mercado' ? 'A mercado' : `Límite ${block.precioLimite} ${block.moneda}`}`)
      lines.push(`  Moneda:      ${block.moneda}`)
      lines.push(`  Fecha:       ${block.fecha || '—'}`)
      lines.push(`  Vigencia:    ${block.vigencia}`)
    } else if (block.type === 'fondos') {
      lines.push(`  Operación:   ${block.operacion === 'compra' ? 'Compra' : 'Venta'}`)
      lines.push(`  Fondo:       ${block.fondo || '—'}`)
      if (block.cusipIsin) lines.push(`  ISIN:        ${block.cusipIsin}`)
      lines.push(`  Monto:       ${block.monto || '—'} ${block.moneda}`)
      lines.push(`  Moneda:      ${block.moneda}`)
      lines.push(`  Fecha:       ${block.fecha || '—'}`)
      lines.push(`  Vigencia:    ${block.vigencia}`)
    } else {
      lines.push(`  Operación:   ${block.operacion === 'compra' ? 'Compra' : 'Venta'}`)
      lines.push(`  Bono:        ${block.descripcion || '—'}`)
      if (block.cusipIsin) lines.push(`  CUSIP:       ${block.cusipIsin}`)
      lines.push(`  Cantidad (VN): ${block.cantidad || '—'} ${block.moneda}`)
      lines.push(`  Precio:      ${block.precio === 'mercado' ? 'A mercado' : `Límite ${block.precioLimite}`}`)
      lines.push(`  Moneda:      ${block.moneda}`)
      lines.push(`  Fecha:       ${block.fecha || '—'}`)
      lines.push(`  Vigencia:    ${block.vigencia}`)
    }
    lines.push(``)
    if (idx < blocks.length - 1) { lines.push(`─────────────────────────────────────────`); lines.push(``) }
  })
  lines.push(`─────────────────────────────────────────`)
  lines.push(``)
  lines.push(`Fecha de instrucción: ${fecha}`)
  lines.push(``)
  lines.push(`Saludos,`)
  lines.push(`Mesa de Operaciones`)
  lines.push(`Roble Capital`)
  lines.push(``)
  lines.push(`─────────────────────────────────────────`)
  return lines.join('\n')
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition placeholder-gray-300'
const selectCls = 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>
}

function InternalSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 pt-2.5 pb-3 space-y-3">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Uso interno</span>
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[9px] text-gray-400 font-medium bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">No se envía al cliente</span>
      </div>
      {children}
    </div>
  )
}

// ─── Block shells ─────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue:    { header: 'bg-blue-50 border-blue-200',       badge: 'bg-blue-100 text-blue-700' },
  emerald: { header: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  amber:   { header: 'bg-amber-50 border-amber-200',     badge: 'bg-amber-100 text-amber-700' },
}

function BlockShell({ title, index, id, color, onRemove, children }: {
  title: string; index: number; id: string; color: keyof typeof COLOR_MAP; onRemove: (id: string) => void; children: React.ReactNode
}) {
  const c = COLOR_MAP[color]
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${c.header}`}>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>#{index + 1}</span>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        <button type="button" onClick={() => onRemove(id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  )
}

// ─── Block forms ──────────────────────────────────────────────────────────────

function AccionesForm({ block, index, onChange, onRemove }: { block: AccionesBlock; index: number; onChange: (id: string, f: string, v: string) => void; onRemove: (id: string) => void }) {
  const upd = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(block.id, f, e.target.value)
  return (
    <BlockShell title="Acciones" index={index} id={block.id} color="blue" onRemove={onRemove}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Operación"><select className={selectCls} value={block.operacion} onChange={upd('operacion')}><option value="compra">Compra</option><option value="venta">Venta</option></select></Field>
        <Field label="Nombre de acción"><input className={inputCls} placeholder="Ej: Apple Inc." value={block.nombre} onChange={upd('nombre')} /></Field>
        <Field label="Ticker"><input className={inputCls} placeholder="Ej: AAPL" value={block.ticker} onChange={upd('ticker')} /></Field>
        <Field label="Cantidad">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} type="number" placeholder="Ej: 100" value={block.cantidad} onChange={upd('cantidad')} />
            <select className="text-sm px-2.5 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none shrink-0 w-20" value={block.cantidadTipo} onChange={upd('cantidadTipo')}>
              <option value="acciones">acc.</option><option value="monto">$</option>
            </select>
          </div>
        </Field>
        <Field label="Tipo de precio"><select className={selectCls} value={block.precio} onChange={upd('precio')}><option value="mercado">A mercado</option><option value="limite">Precio límite</option></select></Field>
        {block.precio === 'limite' && <Field label="Precio límite"><input className={inputCls} placeholder="Ej: 185.50" value={block.precioLimite} onChange={upd('precioLimite')} /></Field>}
        <Field label="Moneda"><select className={selectCls} value={block.moneda} onChange={upd('moneda')}><option value="USD">USD</option><option value="UYU">UYU</option><option value="EUR">EUR</option><option value="ARS">ARS</option></select></Field>
        <Field label="Fecha">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder={todayStr()} value={block.fecha} onChange={upd('fecha')} />
            <button type="button" onClick={() => onChange(block.id, 'fecha', todayStr())} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
          </div>
        </Field>
        <Field label="Vigencia">
          <select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}>
            <option value="DIA">DIA</option>
            <option value="GTC">GTC</option>
          </select>
        </Field>
      </div>
      <InternalSection>
        <Field label="Comisión">
          <input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} />
        </Field>
        <Field label="Observaciones internas">
          <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas, instrucciones adicionales…" value={block.observaciones} onChange={upd('observaciones')} />
        </Field>
      </InternalSection>
    </BlockShell>
  )
}

function FondosForm({ block, index, onChange, onRemove }: { block: FondosBlock; index: number; onChange: (id: string, f: string, v: string) => void; onRemove: (id: string) => void }) {
  const upd = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(block.id, f, e.target.value)
  function handleSelectInstrument(inst: Instrument) {
    onChange(block.id, 'fondo', inst.nombre)
    onChange(block.id, 'cusipIsin', inst.isin ?? inst.cusip ?? '')
    if (inst.moneda) onChange(block.id, 'moneda', inst.moneda)
  }
  return (
    <BlockShell title="Fondo" index={index} id={block.id} color="emerald" onRemove={onRemove}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Operación"><select className={selectCls} value={block.operacion} onChange={upd('operacion')}><option value="compra">Compra</option><option value="venta">Venta</option></select></Field>
        <Field label="Nombre del fondo">
          <InstrumentSearch
            tipo="fondo"
            value={block.fondo}
            onSelect={handleSelectInstrument}
            onChange={(v) => onChange(block.id, 'fondo', v)}
            placeholder="Buscar fondo o escribir nombre…"
            className={inputCls}
          />
        </Field>
        <Field label="ISIN">
          <input className={inputCls} placeholder="Autocompletado al seleccionar fondo" value={block.cusipIsin} onChange={upd('cusipIsin')} />
        </Field>
        <Field label="Monto"><input className={inputCls} type="number" placeholder="Ej: 50000" value={block.monto} onChange={upd('monto')} /></Field>
        <Field label="Moneda"><select className={selectCls} value={block.moneda} onChange={upd('moneda')}><option value="USD">USD</option><option value="UYU">UYU</option><option value="EUR">EUR</option><option value="ARS">ARS</option></select></Field>
        <Field label="Fecha">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder={todayStr()} value={block.fecha} onChange={upd('fecha')} />
            <button type="button" onClick={() => onChange(block.id, 'fecha', todayStr())} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
          </div>
        </Field>
        <Field label="Vigencia">
          <select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}>
            <option value="DIA">DIA</option>
            <option value="GTC">GTC</option>
          </select>
        </Field>
      </div>
      <InternalSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Clase">
            <select className={selectCls} value={block.clase} onChange={upd('clase')}>
              <option value="Acumulativa">Acumulativa</option>
              <option value="Distributiva">Distributiva</option>
            </select>
          </Field>
          <Field label="Comisión">
            <input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} />
          </Field>
        </div>
        <Field label="Observaciones internas">
          <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas, instrucciones adicionales…" value={block.observaciones} onChange={upd('observaciones')} />
        </Field>
      </InternalSection>
    </BlockShell>
  )
}

function BonosForm({ block, index, onChange, onRemove }: { block: BonosBlock; index: number; onChange: (id: string, f: string, v: string) => void; onRemove: (id: string) => void }) {
  const upd = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(block.id, f, e.target.value)
  function handleSelectInstrument(inst: Instrument) {
    onChange(block.id, 'descripcion', inst.nombre)
    onChange(block.id, 'cusipIsin', inst.isin ?? inst.cusip ?? '')
    if (inst.moneda) onChange(block.id, 'moneda', inst.moneda)
  }
  return (
    <BlockShell title="Bono" index={index} id={block.id} color="amber" onRemove={onRemove}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Operación"><select className={selectCls} value={block.operacion} onChange={upd('operacion')}><option value="compra">Compra</option><option value="venta">Venta</option></select></Field>
        <Field label="Identificación del bono">
          <InstrumentSearch
            tipo="bono"
            value={block.descripcion}
            onSelect={handleSelectInstrument}
            onChange={(v) => onChange(block.id, 'descripcion', v)}
            placeholder="Buscar bono o escribir descripción…"
            className={inputCls}
          />
        </Field>
        <Field label="CUSIP / ISIN">
          <input className={inputCls} placeholder="Autocompletado al seleccionar bono" value={block.cusipIsin} onChange={upd('cusipIsin')} />
        </Field>
        <Field label="Cantidad (Valor Nominal)"><input className={inputCls} type="number" placeholder="Ej: 100000" value={block.cantidad} onChange={upd('cantidad')} /></Field>
        <Field label="Tipo de precio"><select className={selectCls} value={block.precio} onChange={upd('precio')}><option value="mercado">A mercado</option><option value="limite">Precio límite</option></select></Field>
        {block.precio === 'limite' && <Field label="Precio límite (% par)"><input className={inputCls} placeholder="Ej: 98.50" value={block.precioLimite} onChange={upd('precioLimite')} /></Field>}
        <Field label="Moneda"><select className={selectCls} value={block.moneda} onChange={upd('moneda')}><option value="USD">USD</option><option value="UYU">UYU</option><option value="EUR">EUR</option></select></Field>
        <Field label="Fecha">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder={todayStr()} value={block.fecha} onChange={upd('fecha')} />
            <button type="button" onClick={() => onChange(block.id, 'fecha', todayStr())} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
          </div>
        </Field>
        <Field label="Vigencia">
          <select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}>
            <option value="DIA">DIA</option>
            <option value="GTC">GTC</option>
          </select>
        </Field>
      </div>
      <InternalSection>
        <Field label="Comisión">
          <input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} />
        </Field>
        <Field label="Observaciones internas">
          <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas, instrucciones adicionales…" value={block.observaciones} onChange={upd('observaciones')} />
        </Field>
      </InternalSection>
    </BlockShell>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  enviado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  borrador: 'bg-blue-50 text-blue-700 border-blue-200',
  copiado:  'bg-gray-100 text-gray-600 border-gray-200',
}
const STATUS_LABEL: Record<string, string> = {
  enviado: 'Enviado', borrador: 'Borrador', copiado: 'Copiado',
}
const INSTRUMENT_STYLE: Record<string, string> = {
  acciones: 'bg-blue-50 text-blue-700',
  fondos:   'bg-emerald-50 text-emerald-700',
  bonos:    'bg-amber-50 text-amber-700',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { gmailConnected: boolean; initialTab?: Tab; isAdmin?: boolean; userName?: string; userEmail?: string }

export default function OrdenesClient({ gmailConnected, initialTab, isAdmin = false, userName = '', userEmail = '' }: Props) {
  const defaultTab: Tab = isAdmin ? 'blotter' : 'mis-ordenes'
  const [tab, setTab] = useState<Tab>(initialTab ?? defaultTab)
  const [blocks, setBlocks]             = useState<OrderBlock[]>([])
  const [clientId, setClientId]         = useState('')
  const [clientName, setClientName]     = useState('')
  const [clientNumber, setClientNumber] = useState('')
  const [fecha, setFecha]               = useState(todayStr())
  const [to, setTo]                     = useState('')

  // CC: trading (always) + asesor (if different email)
  const ccList: string[] = [TRADING_EMAIL]
  if (userEmail && userEmail !== TRADING_EMAIL) ccList.push(userEmail)
  const cc = ccList.join(', ')
  const [preview, setPreview]           = useState<string | null>(null)
  const [sending, setSending]           = useState(false)
  const [sendStatus, setSendStatus]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [copied, setCopied]             = useState(false)

  const asunto = `Confirmacion de orden - ${clientNumber || clientName || '—'} - ${fecha}`

  const addBlock = (type: OrderType) => {
    const id = uid()
    setBlocks(prev => [...prev, type === 'acciones' ? newAcciones(id) : type === 'fondos' ? newFondos(id) : newBonos(id)])
    setPreview(null)
  }
  const removeBlock = useCallback((id: string) => { setBlocks(prev => prev.filter(b => b.id !== id)); setPreview(null) }, [])
  const updateBlock = useCallback((id: string, field: string, value: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } as OrderBlock : b))
    setPreview(null)
  }, [])

  const getBody = () => preview ?? generateEmailText(blocks, clientName, clientNumber, fecha)

  async function saveHistory(status: 'enviado' | 'borrador' | 'copiado'): Promise<string> {
    const instruments = Array.from(new Set(blocks.map(b => b.type)))
    const res = await fetch('/api/ordenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name:   clientName   || null,
        client_number: clientNumber || null,
        client_id:     null,   // legajo ID ≠ clients.id — omit to avoid FK violation
        to_email:      to           || null,
        subject:       asunto,
        body:          getBody(),
        status,
        order_count:   blocks.length,
        instruments,
        blocks,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[ORDER_HISTORY_ERROR]', data?.error)
      throw new Error(data?.error ?? 'Error al guardar en historial')
    }
    console.log('[ORDER_HISTORY_CREATED]', data.order_id, '| status:', status)
    return data.order_id
  }

  const handleGenerate = () => { setPreview(generateEmailText(blocks, clientName, clientNumber, fecha)); setSendStatus(null) }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getBody())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    await saveHistory('copiado')
  }

  const handleClear = () => {
    setBlocks([]); setClientId(''); setClientName(''); setClientNumber('')
    setFecha(todayStr()); setTo(''); setPreview(null); setSendStatus(null)
  }

  const handleSend = async () => {
    if (!to.trim()) { setSendStatus({ ok: false, msg: 'Ingresá al menos un destinatario.' }); return }
    setSending(true); setSendStatus(null)
    try {
      // 1. Guardar en historial PRIMERO
      await saveHistory('enviado')
      // 2. Enviar email
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, subject: asunto, body: getBody(), replyTo: TRADING_EMAIL }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar')
      console.log('[ORDER_EMAIL_SENT]', data.message_id)
      setSendStatus({ ok: true, msg: 'Email enviado correctamente.' })
      // Bump usage stats for this authorized email
      if (to && clientNumber) {
        fetch('/api/authorized-emails/use', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: to, numero_cliente: clientNumber }),
        }).catch(() => {})
      }
    } catch (err: any) {
      setSendStatus({ ok: false, msg: err.message })
    } finally { setSending(false) }
  }

  const handleDraft = async () => {
    setSending(true); setSendStatus(null)
    try {
      // 1. Guardar en historial PRIMERO
      await saveHistory('borrador')
      // 2. Crear borrador en Gmail
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, subject: asunto, body: getBody(), replyTo: TRADING_EMAIL }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear borrador')
      console.log('[ORDER_EMAIL_SENT]', 'draft:', data.draft_id)
      setSendStatus({ ok: true, msg: 'Borrador guardado en Gmail.' })
    } catch (err: any) {
      setSendStatus({ ok: false, msg: err.message })
    } finally { setSending(false) }
  }

  const hasBlocks = blocks.length > 0

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">

      {/* Header */}
      <div className="hidden md:flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Mesa de Operaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">Blotter · trazabilidad completa de órdenes</p>
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
          {(isAdmin
            ? [
                { t: 'blotter'    as Tab, label: 'Blotter' },
                { t: 'mesa'       as Tab, label: 'Mesa de hoy' },
                { t: 'nueva'      as Tab, label: 'Nueva orden' },
                { t: 'instrumentos' as Tab, label: 'Instrumentos' },
              ]
            : [
                { t: 'mis-ordenes' as Tab, label: 'Mis órdenes' },
                { t: 'nueva'       as Tab, label: 'Nueva orden' },
              ]
          ).map(({ t, label }) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-[#2D3F52] text-white shadow-sm' : 'text-gray-500 hover:text-[#2D3F52]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5 mb-4 overflow-x-auto">
        {(isAdmin
          ? [
              { t: 'blotter'    as Tab, label: 'Blotter' },
              { t: 'mesa'       as Tab, label: 'Mesa' },
              { t: 'nueva'      as Tab, label: 'Nueva' },
              { t: 'instrumentos' as Tab, label: 'Instr.' },
            ]
          : [
              { t: 'mis-ordenes' as Tab, label: 'Mis órdenes' },
              { t: 'nueva'       as Tab, label: 'Nueva' },
            ]
        ).map(({ t, label }) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap px-2 ${
              tab === t ? 'bg-[#2D3F52] text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── NUEVA ORDEN ── */}
      {tab === 'nueva' && (
        <div className="flex flex-col md:flex-row gap-4 md:gap-5">

          {/* Left: form */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Client + general info */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Información general</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Legajos search */}
                <div className="md:col-span-1">
                  <label className={labelCls}>
                    Buscar cliente
                    <span className="ml-1 text-[9px] font-normal text-gray-400 normal-case tracking-normal">Legajos</span>
                  </label>
                  <LegajosSearchInput
                    value={clientId}
                    onChange={(id, name, number) => {
                      setClientId(id)
                      if (name) setClientName(name)
                      if (number) setClientNumber(number)
                      if (!id) { setClientName(''); setClientNumber(''); setTo('') }
                      setPreview(null)
                    }}
                    placeholder="Nombre, N° o código…"
                  />
                </div>
                <div>
                  <label className={labelCls}>Nombre del cliente</label>
                  <input className={inputCls} placeholder="Autocompletado desde Legajos" value={clientName}
                    onChange={e => { setClientName(e.target.value); setPreview(null) }} />
                </div>
                <div>
                  <label className={labelCls}>N° de cliente</label>
                  <input className={inputCls} placeholder="Autocompletado desde Legajos" value={clientNumber}
                    onChange={e => { setClientNumber(e.target.value); setPreview(null) }} />
                </div>
                <div>
                  <label className={labelCls}>Fecha de instrucción</label>
                  <div className="flex gap-2">
                    <input className={`${inputCls} flex-1 min-w-0`} value={fecha} onChange={e => { setFecha(e.target.value); setPreview(null) }} />
                    <button type="button" onClick={() => { setFecha(todayStr()); setPreview(null) }}
                      className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Order blocks */}
            {hasBlocks && (
              <div className="space-y-3">
                {blocks.map((block, idx) =>
                  block.type === 'acciones' ? <AccionesForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
                  : block.type === 'fondos' ? <FondosForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
                  : <BonosForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
                )}
              </div>
            )}

            {/* Add block */}
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Agregar orden</p>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => addBlock('acciones')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                  Acciones
                </button>
                <button type="button" onClick={() => addBlock('fondos')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Fondos
                </button>
                <button type="button" onClick={() => addBlock('bonos')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" /></svg>
                  Bonos
                </button>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleGenerate} disabled={!hasBlocks}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity bg-[#2D3F52] whitespace-nowrap">
                Generar preview
              </button>
              <button type="button" onClick={handleCopy} disabled={!hasBlocks}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap">
                {copied
                  ? <><svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copiado</>
                  : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copiar</>
                }
              </button>
              <button type="button" onClick={handleClear}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition whitespace-nowrap">
                Limpiar
              </button>
            </div>
          </div>

          {/* Right: send + preview */}
          <div className="w-full md:w-[380px] md:shrink-0 space-y-4">

            {/* Send panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Enviar email</h3>
                {gmailConnected
                  ? <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Gmail conectado</span>
                  : <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Gmail no conectado</span>
                }
              </div>

              {/* De — fixed Trading */}
              <div>
                <label className={labelCls}>De</label>
                <p className="text-sm px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-gray-600">
                  Mesa de Operaciones | Roble Capital
                </p>
              </div>

              <div>
                <label className={labelCls}>Destinatario</label>
                <TradingEmailSearch
                  value={to}
                  onChange={(v) => setTo(v)}
                  className={inputCls}
                />
              </div>

              {/* CC: trading + asesor */}
              <div>
                <label className={labelCls}>CC <span className="text-[10px] text-gray-400 normal-case tracking-normal font-normal">(automático)</span></label>
                <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50">
                  {ccList.map(email => (
                    <span key={email} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${email === TRADING_EMAIL ? 'bg-[#2D3F52]/10 text-[#2D3F52]' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                      {email === TRADING_EMAIL ? '📊 ' : '👤 '}{email}
                    </span>
                  ))}
                </div>
              </div>

              {/* Reply-To */}
              <div>
                <label className={labelCls}>Respuestas a</label>
                <p className="text-sm px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-gray-600">{TRADING_EMAIL}</p>
              </div>

              <div>
                <label className={labelCls}>Asunto</label>
                <p className="text-sm px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-gray-600 truncate">{asunto}</p>
              </div>

              {!gmailConnected && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  Gmail no conectado. Podés copiar el texto y enviarlo desde tu cliente de correo.
                  Conectá Gmail en <strong>Configuración → Gmail</strong>.
                </div>
              )}

              {sendStatus && (
                <div className={`px-3 py-2 rounded-lg text-xs font-medium ${sendStatus.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {sendStatus.msg}
                </div>
              )}

              <div className="flex gap-2 pt-0.5">
                {gmailConnected && (
                  <button type="button" onClick={handleSend} disabled={sending || !hasBlocks}
                    className="flex-1 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-40 flex items-center justify-center gap-1.5 bg-[#2D3F52] transition-opacity">
                    {sending
                      ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    }
                    Enviar
                  </button>
                )}
                <button type="button" onClick={handleDraft} disabled={sending || !hasBlocks || !gmailConnected}
                  className="flex-1 py-2 text-sm font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center gap-1.5 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                  Borrador
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vista previa del email</span>
                {preview && (
                  <button type="button" onClick={handleCopy} className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                )}
              </div>
              {preview ? (
                <div className="overflow-y-auto max-h-[580px]">
                  {/* Email headers */}
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 space-y-1.5">
                    {[
                      { label: 'De',            value: 'Mesa de Operaciones | Roble Capital' },
                      { label: 'Para',          value: to || '—' },
                      { label: 'CC',            value: cc },
                      { label: 'Respuestas a',  value: TRADING_EMAIL },
                      { label: 'Asunto',        value: asunto },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex gap-2 text-xs">
                        <span className="w-24 shrink-0 font-semibold text-gray-400 text-right">{label}:</span>
                        <span className="text-gray-700 break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                  {/* Body */}
                  <pre className="p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">{preview}</pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                  <svg className="w-9 h-9 text-gray-200 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-sm text-gray-400 font-medium">Sin preview aún</p>
                  <p className="text-xs text-gray-300 mt-1">Agregá órdenes y presioná<br /><strong className="text-gray-400">Generar preview</strong></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BLOTTER GENERAL ── */}
      {tab === 'blotter' && isAdmin && (
        <BlotterTable isAdmin={isAdmin} userName={userName} />
      )}

      {/* ── MESA DE HOY ── */}
      {tab === 'mesa' && isAdmin && (
        <BlotterTable isAdmin={isAdmin} userName={userName} soloHoy />
      )}

      {/* ── MIS ÓRDENES ── */}
      {tab === 'mis-ordenes' && (
        <BlotterTable isAdmin={false} userName={userName} />
      )}

      {tab === 'instrumentos' && (
        <InstrumentsManager />
      )}

      {/* ── FAB: Nueva Orden — mobile only ── */}
      {(tab === 'blotter' || tab === 'mesa' || tab === 'mis-ordenes') && (
        <button
          onClick={() => setTab('nueva')}
          className="md:hidden fixed bottom-[72px] right-4 z-20 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full shadow-xl font-semibold text-sm text-white transition-transform active:scale-95"
          style={{ backgroundColor: '#16A34A' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva orden
        </button>
      )}
    </div>
  )
}
