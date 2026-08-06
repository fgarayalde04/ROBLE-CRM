'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LegajosSearchInput from '@/components/LegajosSearchInput'
import InstrumentSearch from '@/components/InstrumentSearch'

const TIPOS_OP   = ['compra', 'venta', 'suscripcion', 'rescate'] as const
const TIPOS_INST = ['fondos', 'bonos', 'acciones'] as const
const MONEDAS    = ['USD', 'UYU', 'EUR', 'ARS'] as const
const CLASES     = ['Acumulativa', 'Distributiva'] as const

type TipoOp   = typeof TIPOS_OP[number]
type TipoInst = typeof TIPOS_INST[number]

const OP_LABEL: Record<TipoOp, string>    = { compra:'Compra', venta:'Venta', suscripcion:'Suscripción', rescate:'Rescate' }
const INST_LABEL: Record<TipoInst, string> = { fondos:'Fondo', bonos:'Bono', acciones:'Acción' }

interface Form {
  client_id: string; client_name: string; client_number: string; client_email: string
  tipo_operacion: TipoOp | ''
  instrumento_tipo: TipoInst | ''
  instrumento_nombre: string
  cusip_isin: string
  clase: string
  moneda: string
  monto: string
  observaciones: string
}

const empty: Form = {
  client_id: '', client_name: '', client_number: '', client_email: '',
  tipo_operacion: '', instrumento_tipo: '', instrumento_nombre: '',
  cusip_isin: '', clase: '', moneda: 'USD', monto: '', observaciones: '',
}

const inputCls  = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 focus:border-[#2D3F52]'
const selectCls = inputCls + ' bg-white'

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function FormularioMesa({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [form, setForm]       = useState<Form>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function set(key: keyof Form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleClientSelect(id: string, displayName: string, customerNumber: string, _fa?: string, email?: string | null) {
    setForm(prev => ({ ...prev, client_id: id, client_name: displayName, client_number: customerNumber, client_email: email ?? '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id)              return setError('Seleccioná un cliente')
    if (!form.tipo_operacion)         return setError('Seleccioná el tipo de operación')
    if (!form.instrumento_tipo)       return setError('Seleccioná el tipo de instrumento')
    if (!form.instrumento_nombre.trim()) return setError('Ingresá el instrumento')

    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monto: form.monto ? Number(form.monto) : null,
          fecha_operacion: new Date().toISOString().split('T')[0],
          directo: false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al crear solicitud')
      setSuccess(`Solicitud ${json.solicitud_id} enviada a Mesa de Operaciones`)
      setForm(empty)
      setTimeout(() => router.refresh(), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Envío a Mesa de Operaciones</span>
        </div>
      </div>

      {/* Cliente */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</h3>
        <Field label="Buscar cliente" required>
          <LegajosSearchInput
            value={form.client_name}
            onChange={handleClientSelect}
            placeholder="Nombre o número de cliente…"
          />
        </Field>
        {form.client_id && (
          <div className="bg-gray-50 rounded px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">N° cliente</span>
            <span className="text-xs font-mono text-gray-700">{form.client_number || '—'}</span>
          </div>
        )}
      </div>

      {/* Operación */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Operación</h3>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de operación" required>
            <select className={selectCls} value={form.tipo_operacion}
              onChange={e => set('tipo_operacion', e.target.value)} required>
              <option value="">Seleccioná…</option>
              {TIPOS_OP.map(t => <option key={t} value={t}>{OP_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Tipo de instrumento" required>
            <select className={selectCls} value={form.instrumento_tipo}
              onChange={e => { set('instrumento_tipo', e.target.value); set('instrumento_nombre', ''); set('clase', '') }} required>
              <option value="">Seleccioná…</option>
              {TIPOS_INST.map(t => <option key={t} value={t}>{INST_LABEL[t]}</option>)}
            </select>
          </Field>
        </div>

        <Field label={form.instrumento_tipo ? INST_LABEL[form.instrumento_tipo as TipoInst] : 'Fondo / Bono / Acción'} required>
          {form.instrumento_tipo === 'fondos' || form.instrumento_tipo === 'bonos' ? (
            <InstrumentSearch
              tipo={form.instrumento_tipo === 'fondos' ? 'fondo' : 'bono'}
              value={form.instrumento_nombre}
              onSelect={inst => setForm(prev => ({ ...prev, instrumento_nombre: inst.nombre, cusip_isin: inst.isin ?? inst.cusip ?? '' }))}
              onChange={v => set('instrumento_nombre', v)}
              placeholder={`Buscar ${form.instrumento_tipo === 'fondos' ? 'fondo' : 'bono'}…`}
            />
          ) : (
            <input type="text" className={inputCls} value={form.instrumento_nombre}
              onChange={e => set('instrumento_nombre', e.target.value)}
              placeholder="Nombre del producto…" />
          )}
        </Field>

        {form.instrumento_tipo === 'fondos' && (
          <Field label="Clase">
            <select className={selectCls} value={form.clase} onChange={e => set('clase', e.target.value)}>
              <option value="">— Sin clase —</option>
              {CLASES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Moneda" required>
            <select className={selectCls} value={form.moneda} onChange={e => set('moneda', e.target.value)} required>
              {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Monto aproximado">
            <input type="number" min={0} step="0.01" className={inputCls} value={form.monto}
              onChange={e => set('monto', e.target.value)} placeholder="0.00" />
          </Field>
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <Field label="Observaciones para la Mesa">
          <textarea className={inputCls + ' min-h-[90px] resize-y'} value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            placeholder="Instrucciones, contexto o detalle adicional para que la Mesa complete la operación…" />
        </Field>
      </div>

      {/* Feedback */}
      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{success}</p>}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting}
          className="px-6 py-2.5 bg-[#2D3F52] text-white text-sm font-medium rounded-lg hover:bg-[#354A5E] disabled:opacity-50 transition-colors flex items-center gap-2">
          {submitting ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando…</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Enviar a Mesa de Operaciones
            </>
          )}
        </button>
        <p className="text-xs text-gray-400">La Mesa completará el resto y enviará el correo al cliente.</p>
      </div>
    </form>
  )
}
