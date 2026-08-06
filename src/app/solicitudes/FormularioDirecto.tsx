'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import LegajosSearchInput from '@/components/LegajosSearchInput'
import InstrumentSearch from '@/components/InstrumentSearch'
import type { Instrument } from '@/app/api/instruments/route'

interface TeamMember { name: string; email: string }

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderType = 'acciones' | 'fondos' | 'bonos'

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
  vigencia: 'DIA' | 'GTC'; comision: string; maturity: string; cupon: string
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
  return { type: 'bonos', id, descripcion: '', cusipIsin: '', cantidad: '', precio: 'mercado', precioLimite: '', moneda: 'USD', operacion: 'compra', fecha: todayStr(), observaciones: '', vigencia: 'DIA', comision: '', maturity: '', cupon: '' }
}

// ─── Email generation ─────────────────────────────────────────────────────────

function generateEmailText(blocks: OrderBlock[], clientName: string, clientNumber: string, fecha: string): string {
  if (!blocks.length) return ''
  const lines: string[] = []
  lines.push(`Estimado,`)
  lines.push(``)
  lines.push(`De acuerdo a lo conversado, le pido que nos confirme la siguiente operación.`)
  lines.push(``)
  lines.push(`Muchas gracias,`)
  lines.push(``)
  if (clientName)   lines.push(`Nombre de cliente: ${clientName}`)
  if (clientNumber) lines.push(`numero de cliente: ${clientNumber}`)
  lines.push(``)

  blocks.forEach((block, idx) => {
    lines.push(`─────────────────────────────────────────`)
    lines.push(``)
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
  })

  lines.push(`─────────────────────────────────────────`)
  lines.push(``)
  lines.push(`Fecha de instrucción: ${fecha}`)
  lines.push(``)
  lines.push(`Saludos,`)
  lines.push(`Mesa de Operaciones`)
  lines.push(`Roble Capital`)
  return lines.join('\n')
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBlocks(blocks: OrderBlock[]): string[] {
  const errs: string[] = []
  blocks.forEach((block, i) => {
    const n = i + 1
    if (block.type === 'acciones') {
      if (!block.nombre.trim()) errs.push(`Orden ${n} (Acción): falta nombre de la empresa`)
      if (!block.ticker.trim()) errs.push(`Orden ${n} (Acción): falta ticker`)
      if (!block.cantidad.trim()) errs.push(`Orden ${n} (Acción): falta cantidad`)
    } else if (block.type === 'fondos') {
      if (!block.fondo.trim()) errs.push(`Orden ${n} (Fondo): falta nombre del fondo`)
      if (!block.monto.trim()) errs.push(`Orden ${n} (Fondo): falta monto`)
    } else {
      if (!block.descripcion.trim()) errs.push(`Orden ${n} (Bono): falta descripción del bono`)
      if (!block.cantidad.trim()) errs.push(`Orden ${n} (Bono): falta valor nominal`)
    }
  })
  return errs
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
        <Field label="Nombre de la empresa *"><input className={inputCls} placeholder="Ej: Apple Inc." value={block.nombre} onChange={upd('nombre')} /></Field>
        <Field label="Ticker *"><input className={inputCls} placeholder="Ej: AAPL" value={block.ticker} onChange={upd('ticker')} /></Field>
        <Field label="Cantidad *">
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
        <Field label="Vigencia"><select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}><option value="DIA">DIA</option><option value="GTC">GTC</option></select></Field>
      </div>
      <InternalSection>
        <Field label="Comisión"><input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} /></Field>
        <Field label="Observaciones internas"><textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas…" value={block.observaciones} onChange={upd('observaciones')} /></Field>
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
        <Field label="Nombre del fondo *">
          <InstrumentSearch tipo="fondo" value={block.fondo} onSelect={handleSelectInstrument} onChange={(v) => onChange(block.id, 'fondo', v)} placeholder="Buscar fondo o escribir nombre…" className={inputCls} />
        </Field>
        <Field label="ISIN"><input className={inputCls} placeholder="Autocompletado al seleccionar fondo" value={block.cusipIsin} onChange={upd('cusipIsin')} /></Field>
        <Field label="Monto *"><input className={inputCls} type="number" placeholder="Ej: 50000" value={block.monto} onChange={upd('monto')} /></Field>
        <Field label="Moneda"><select className={selectCls} value={block.moneda} onChange={upd('moneda')}><option value="USD">USD</option><option value="UYU">UYU</option><option value="EUR">EUR</option><option value="ARS">ARS</option></select></Field>
        <Field label="Fecha">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder={todayStr()} value={block.fecha} onChange={upd('fecha')} />
            <button type="button" onClick={() => onChange(block.id, 'fecha', todayStr())} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
          </div>
        </Field>
        <Field label="Vigencia"><select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}><option value="DIA">DIA</option><option value="GTC">GTC</option></select></Field>
      </div>
      <InternalSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Clase"><select className={selectCls} value={block.clase} onChange={upd('clase')}><option value="Acumulativa">Acumulativa</option><option value="Distributiva">Distributiva</option></select></Field>
          <Field label="Comisión"><input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} /></Field>
        </div>
        <Field label="Observaciones internas"><textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas…" value={block.observaciones} onChange={upd('observaciones')} /></Field>
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
        <Field label="Identificación del bono *">
          <InstrumentSearch tipo="bono" value={block.descripcion} onSelect={handleSelectInstrument} onChange={(v) => onChange(block.id, 'descripcion', v)} placeholder="Buscar bono o escribir descripción…" className={inputCls} />
        </Field>
        <Field label="CUSIP / ISIN"><input className={inputCls} placeholder="Autocompletado al seleccionar bono" value={block.cusipIsin} onChange={upd('cusipIsin')} /></Field>
        <Field label="Vencimiento (Maturity)"><input className={inputCls} placeholder="Ej: 15/03/2030" value={block.maturity} onChange={upd('maturity')} /></Field>
        <Field label="Cupón (%)"><input className={inputCls} type="number" placeholder="Ej: 6.50" value={block.cupon} onChange={upd('cupon')} /></Field>
        <Field label="Cantidad (Valor Nominal) *"><input className={inputCls} type="number" placeholder="Ej: 100000" value={block.cantidad} onChange={upd('cantidad')} /></Field>
        <Field label="Tipo de precio"><select className={selectCls} value={block.precio} onChange={upd('precio')}><option value="mercado">A mercado</option><option value="limite">Precio límite</option></select></Field>
        {block.precio === 'limite' && <Field label="Precio límite (% par)"><input className={inputCls} placeholder="Ej: 98.50" value={block.precioLimite} onChange={upd('precioLimite')} /></Field>}
        <Field label="Moneda"><select className={selectCls} value={block.moneda} onChange={upd('moneda')}><option value="USD">USD</option><option value="UYU">UYU</option><option value="EUR">EUR</option></select></Field>
        <Field label="Fecha">
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder={todayStr()} value={block.fecha} onChange={upd('fecha')} />
            <button type="button" onClick={() => onChange(block.id, 'fecha', todayStr())} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
          </div>
        </Field>
        <Field label="Vigencia"><select className={selectCls} value={block.vigencia} onChange={upd('vigencia')}><option value="DIA">DIA</option><option value="GTC">GTC</option></select></Field>
      </div>
      <InternalSection>
        <Field label="Comisión"><input className={inputCls} placeholder="Ej: 1% / USD 250" value={block.comision} onChange={upd('comision')} /></Field>
        <Field label="Observaciones internas"><textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas internas…" value={block.observaciones} onChange={upd('observaciones')} /></Field>
      </InternalSection>
    </BlockShell>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { onBack: () => void; gmailConnected?: boolean; userEmail?: string }

export default function FormularioDirecto({ onBack }: Props) {
  const [blocks, setBlocks]             = useState<OrderBlock[]>([])
  const [clientId, setClientId]         = useState('')
  const [clientName, setClientName]     = useState('')
  const [clientNumber, setClientNumber] = useState('')
  const [clientEmail, setClientEmail]   = useState('')
  const [emailMissing, setEmailMissing] = useState(false)
  const [fecha, setFecha]               = useState(todayStr())
  const [ccEmails, setCcEmails]         = useState<string[]>([])
  const [ccInput, setCcInput]           = useState('')
  const [teamMembers, setTeamMembers]   = useState<TeamMember[]>([])
  const [showCcSugg, setShowCcSugg]     = useState(false)
  const ccRef                           = useRef<HTMLDivElement>(null)
  const [preview, setPreview]           = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [sending, setSending]           = useState(false)
  const [sent, setSent]                 = useState(false)
  const [solicitudId, setSolicitudId]   = useState<string | null>(null)
  const [submitError, setSubmitError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/team-emails').then(r => r.json()).then(d => setTeamMembers(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ccRef.current && !ccRef.current.contains(e.target as Node)) setShowCcSugg(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const ccSuggestions = teamMembers.filter(m =>
    m.email && !ccEmails.includes(m.email) &&
    (ccInput === '' || m.name.toLowerCase().includes(ccInput.toLowerCase()) || m.email.toLowerCase().includes(ccInput.toLowerCase()))
  )

  function addCc(email: string) {
    const trimmed = email.trim()
    if (trimmed && !ccEmails.includes(trimmed)) setCcEmails(prev => [...prev, trimmed])
    setCcInput(''); setShowCcSugg(false)
  }

  function removeCc(email: string) { setCcEmails(prev => prev.filter(e => e !== email)) }

  const addBlock = (type: OrderType) => {
    const id = uid()
    setBlocks(prev => [...prev, type === 'acciones' ? newAcciones(id) : type === 'fondos' ? newFondos(id) : newBonos(id)])
    setPreview(null)
    setValidationErrors([])
  }
  const removeBlock = useCallback((id: string) => { setBlocks(prev => prev.filter(b => b.id !== id)); setPreview(null) }, [])
  const updateBlock = useCallback((id: string, field: string, value: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } as OrderBlock : b))
    setPreview(null)
  }, [])

  const asunto = `Confirmacion de orden - ${clientNumber || clientName || '—'} - ${fecha}`

  function handleGenerate() {
    const globalErrors: string[] = []
    if (!clientName.trim()) globalErrors.push('Seleccioná un cliente')
    if (!clientEmail.trim()) globalErrors.push('El cliente no tiene email registrado. Verificá su ficha.')
    if (blocks.length === 0) globalErrors.push('Agregá al menos un activo a la orden')
    const blockErrors = validateBlocks(blocks)
    const allErrors = [...globalErrors, ...blockErrors]
    setValidationErrors(allErrors)
    if (allErrors.length > 0) return
    setPreview(generateEmailText(blocks, clientName, clientNumber, fecha))
  }

  async function handleEnviarRevision() {
    const globalErrors: string[] = []
    if (!clientName.trim()) globalErrors.push('Seleccioná un cliente')
    if (!clientEmail.trim()) globalErrors.push('El cliente no tiene email registrado. Ingresalo manualmente.')
    if (blocks.length === 0) globalErrors.push('Agregá al menos un activo')
    const blockErrors = validateBlocks(blocks)
    const allErrors = [...globalErrors, ...blockErrors]
    if (allErrors.length > 0) { setValidationErrors(allErrors); return }

    // Auto-generate preview if not yet done
    const emailBody = preview ?? generateEmailText(blocks, clientName, clientNumber, fecha)
    if (!preview) setPreview(emailBody)

    setSending(true); setSubmitError(null); setValidationErrors([])
    try {
      const firstOp = blocks[0]
      const tipoOp = firstOp.type === 'fondos'
        ? (firstOp.operacion === 'compra' ? 'suscripcion' : 'rescate')
        : firstOp.operacion as 'compra' | 'venta'
      const firstNombre = firstOp.type === 'acciones' ? firstOp.nombre
        : firstOp.type === 'fondos' ? firstOp.fondo
        : firstOp.descripcion
      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:          null,
          client_name:        clientName,
          client_number:      clientNumber || null,
          client_email:       clientEmail  || null,
          fecha_operacion:    fecha,
          tipo_operacion:     tipoOp,
          instrumento_tipo:   firstOp.type,
          instrumento_nombre: blocks.length === 1 ? firstNombre : `${blocks.length} activos`,
          moneda:             firstOp.moneda ?? 'USD',
          assets_json:        blocks,
          mail_preview:       emailBody,
          mail_asunto:        asunto,
          cc_emails:          ccEmails.length > 0 ? ccEmails : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? 'Error al enviar la solicitud')
        return
      }
      setSolicitudId(data.solicitud_id)
      setSent(true)
      // Si el email fue ingresado manualmente, guardarlo para futuras órdenes
      if (emailMissing && clientEmail) {
        fetch('/api/authorized-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numero_cliente: clientNumber || null,
            nombre_cliente: clientName  || null,
            email:          clientEmail,
          }),
        }).catch(() => {})
      }
    } catch (err: any) {
      setSubmitError(err.message ?? 'Error de conexión')
    } finally { setSending(false) }
  }

  function handleNuevaOrden() {
    setBlocks([]); setClientId(''); setClientName(''); setClientNumber('')
    setClientEmail(''); setEmailMissing(false); setFecha(todayStr())
    setCcEmails([]); setCcInput('')
    setPreview(null); setValidationErrors([]); setSent(false); setSolicitudId(null); setSubmitError(null)
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Orden enviada a revisión interna</p>
          {solicitudId && <p className="text-xs font-mono text-gray-400 mt-1">N° {solicitudId}</p>}
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">
            El equipo de Mesa de Operaciones revisará la orden y enviará el correo al cliente una vez aprobada.
          </p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={handleNuevaOrden}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#2D3F52] text-white hover:bg-[#354A5E] transition">
            Nueva orden
          </button>
          <button onClick={onBack}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  const hasBlocks = blocks.length > 0

  return (
    <div className="space-y-4">

      {/* Back */}
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700 mb-1.5">Corregí los siguientes campos antes de continuar:</p>
          <ul className="space-y-0.5">
            {validationErrors.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700">{submitError}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">

        {/* Left: form */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Cliente */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className={labelCls}>
                  Buscar cliente
                  <span className="ml-1 text-[9px] font-normal text-gray-400 normal-case tracking-normal">Legajos</span>
                </label>
                <LegajosSearchInput
                  value={clientId}
                  onChange={(id, name, number, _fa, email) => {
                    setClientId(id)
                    if (name) setClientName(name)
                    if (number) setClientNumber(number)
                    if (!id) {
                      setClientName(''); setClientNumber(''); setClientEmail(''); setEmailMissing(false)
                    } else if (email) {
                      setClientEmail(email); setEmailMissing(false)
                    } else {
                      setEmailMissing(true)
                    }
                    setPreview(null); setValidationErrors([])
                  }}
                  placeholder="Nombre, N° o código…"
                />
              </div>
              <div>
                <label className={labelCls}>Nombre</label>
                <input className={inputCls} placeholder="Autocompletado desde Legajos" value={clientName}
                  onChange={e => { setClientName(e.target.value); setPreview(null) }} />
              </div>
              <div>
                <label className={labelCls}>N° de cliente</label>
                <input className={inputCls} placeholder="Autocompletado desde Legajos" value={clientNumber}
                  onChange={e => { setClientNumber(e.target.value); setPreview(null) }} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={`${inputCls} ${emailMissing ? 'border-amber-300 bg-amber-50' : ''}`}
                  placeholder="Email del cliente" value={clientEmail}
                  onChange={e => { setClientEmail(e.target.value); setEmailMissing(false); setPreview(null) }} />
                {emailMissing && (
                  <p className="mt-1 text-[11px] text-amber-600">No tiene email en su ficha. Ingresalo manualmente.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Fecha de instrucción</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} flex-1 min-w-0`} value={fecha}
                    onChange={e => { setFecha(e.target.value); setPreview(null) }} />
                  <button type="button" onClick={() => { setFecha(todayStr()); setPreview(null) }}
                    className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0 transition whitespace-nowrap">Hoy</button>
                </div>
              </div>

              {/* CC interno */}
              <div className="md:col-span-3">
                <label className={labelCls}>CC (copia interna)</label>
                <div ref={ccRef} className="relative">
                  {/* Pills de emails ya agregados */}
                  <div className={`${inputCls} min-h-[38px] flex flex-wrap gap-1.5 items-center cursor-text`}
                    onClick={() => { setShowCcSugg(true) }}>
                    {ccEmails.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium px-2 py-0.5 rounded-full">
                        {email}
                        <button type="button" onClick={e => { e.stopPropagation(); removeCc(email) }} className="hover:text-red-500 transition">×</button>
                      </span>
                    ))}
                    <input
                      className="flex-1 min-w-[140px] outline-none text-sm bg-transparent placeholder-gray-300"
                      placeholder={ccEmails.length === 0 ? 'Buscar o escribir email…' : ''}
                      value={ccInput}
                      onChange={e => { setCcInput(e.target.value); setShowCcSugg(true) }}
                      onFocus={() => setShowCcSugg(true)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && ccInput.trim()) {
                          e.preventDefault(); addCc(ccInput)
                        }
                        if (e.key === 'Backspace' && !ccInput && ccEmails.length > 0) {
                          removeCc(ccEmails[ccEmails.length - 1])
                        }
                      }}
                    />
                  </div>
                  {showCcSugg && ccSuggestions.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {ccSuggestions.map(m => (
                        <button key={m.email} type="button"
                          onMouseDown={e => { e.preventDefault(); addCc(m.email) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left transition">
                          <div className="w-6 h-6 rounded-full bg-[#2D3F52] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{m.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Presioná Enter o coma para agregar. El equipo de Roble aparece como sugerencia.</p>
              </div>
            </div>
          </div>

          {/* Bloques */}
          {hasBlocks && (
            <div className="space-y-3">
              {blocks.map((block, idx) =>
                block.type === 'acciones' ? <AccionesForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
                : block.type === 'fondos' ? <FondosForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
                : <BonosForm key={block.id} block={block} index={idx} onChange={updateBlock} onRemove={removeBlock} />
              )}
            </div>
          )}

          {/* Agregar activo */}
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Agregar activo</p>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => addBlock('acciones')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                Acción
              </button>
              <button type="button" onClick={() => addBlock('fondos')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Fondo
              </button>
              <button type="button" onClick={() => addBlock('bonos')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" /></svg>
                Bono
              </button>
            </div>
          </div>

          {/* Resumen */}
          {hasBlocks && (
            <div className="bg-[#2D3F52]/5 rounded-xl border border-[#2D3F52]/10 p-3">
              <p className="text-xs font-semibold text-[#2D3F52] mb-1.5">Resumen de la orden</p>
              <div className="flex flex-wrap gap-1.5">
                {blocks.map((b, i) => (
                  <span key={b.id} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    b.type === 'acciones' ? 'bg-blue-100 text-blue-700' :
                    b.type === 'fondos'   ? 'bg-emerald-100 text-emerald-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    #{i+1} {b.type === 'acciones' ? b.nombre || 'Acción' : b.type === 'fondos' ? b.fondo || 'Fondo' : b.descripcion || 'Bono'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Botones acción */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleGenerate} disabled={!hasBlocks}
              className="px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition bg-[#2D3F52] whitespace-nowrap">
              Generar preview del email
            </button>
            <button type="button" onClick={() => { setBlocks([]); setClientId(''); setClientName(''); setClientNumber(''); setClientEmail(''); setFecha(todayStr()); setCcEmails([]); setCcInput(''); setPreview(null); setValidationErrors([]) }}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition whitespace-nowrap">
              Limpiar
            </button>
          </div>
        </div>

        {/* Right: preview + envío */}
        <div className="w-full lg:w-[400px] lg:shrink-0 space-y-4">

          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-amber-800">Revisión interna requerida</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                El correo no se envía directamente al cliente. Mesa de Operaciones revisa la orden y lo envía una vez aprobado.
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Preview del email</span>
              {preview && (
                <button type="button" onClick={() => navigator.clipboard.writeText(preview)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copiar
                </button>
              )}
            </div>
            {preview ? (
              <div className="overflow-y-auto max-h-[560px]">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 space-y-1.5">
                  <div className="flex gap-2 text-xs">
                    <span className="w-16 shrink-0 font-semibold text-gray-400 text-right">Para:</span>
                    <span className="text-gray-700">{clientEmail || clientName || '—'}</span>
                  </div>
                  {ccEmails.length > 0 && (
                    <div className="flex gap-2 text-xs">
                      <span className="w-16 shrink-0 font-semibold text-gray-400 text-right">CC:</span>
                      <span className="text-gray-700 break-all">{ccEmails.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex gap-2 text-xs">
                    <span className="w-16 shrink-0 font-semibold text-gray-400 text-right">Asunto:</span>
                    <span className="text-gray-700 break-all">{asunto}</span>
                  </div>
                </div>
                <pre className="p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">{preview}</pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
                <svg className="w-8 h-8 text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-gray-400 font-medium">Sin preview</p>
                <p className="text-xs text-gray-300 mt-1">Completá la orden y presioná<br /><strong className="text-gray-400">Generar preview del email</strong></p>
              </div>
            )}
          </div>

          {/* Enviar a revisión — siempre visible cuando hay activos */}
          {hasBlocks && (
            <button type="button" onClick={handleEnviarRevision} disabled={sending}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#2D3F52] hover:bg-[#354A5E] disabled:opacity-50 flex items-center justify-center gap-2 transition shadow-sm">
              {sending
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Enviando…</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>Enviar a revisión interna</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
