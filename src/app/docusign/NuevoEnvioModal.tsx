'use client'
import { useState, useEffect } from 'react'

interface Firmante {
  nombre: string
  apellido: string
  email: string
  rol: string
  orden: number
}

interface DocumentoSel {
  nombre: string
  tipo: 'ficha' | 'cuestionario' | 'lista' | 'manual'
}

const ROLES = ['Titular', 'Cotitular', 'Apoderado', 'Representante', 'Beneficiario Final', 'Oficial de Cumplimiento', 'Firma Interna']

export default function NuevoEnvioModal({
  onClose,
  onCreado,
  // Datos pre-cargados cuando se llega desde Ficha BCU
  prefill,
}: {
  onClose: () => void
  onCreado: () => void
  prefill?: {
    client_name?: string
    empresa?: string
    tipo_cliente?: string
    documentos?: DocumentoSel[]
    firmantes?: Firmante[]
  }
}) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)

  // Paso 1 — Configuración general
  const [clientName, setClientName]   = useState(prefill?.client_name ?? '')
  const [empresa, setEmpresa]         = useState<'roble' | 'geliene'>(prefill?.empresa as any ?? 'roble')
  const [tipoCli, setTipoCli]         = useState<'pf' | 'pj'>(prefill?.tipo_cliente as any ?? 'pf')
  const [mensaje, setMensaje]         = useState('Estimado/a, le enviamos los documentos para su revisión y firma electrónica.')
  const [fechaLimite, setFechaLimite] = useState('')
  const [documentos, setDocumentos]   = useState<DocumentoSel[]>(
    prefill?.documentos ?? [{ nombre: 'Ficha de Cliente', tipo: 'ficha' }]
  )

  // Paso 2 — Firmantes
  const [firmantes, setFirmantes] = useState<Firmante[]>(
    prefill?.firmantes ?? [{ nombre: '', apellido: '', email: '', rol: 'Titular', orden: 1 }]
  )

  const addFirmante = () => setFirmantes(prev => [...prev, {
    nombre: '', apellido: '', email: '', rol: 'Firmante', orden: prev.length + 1,
  }])

  const removeFirmante = (i: number) => setFirmantes(prev => prev.filter((_, idx) => idx !== i))

  const updateFirmante = (i: number, field: keyof Firmante, val: string | number) =>
    setFirmantes(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: val } : f))

  const toggleDoc = (tipo: DocumentoSel['tipo'], nombre: string) => {
    setDocumentos(prev => {
      const exists = prev.find(d => d.tipo === tipo)
      if (exists) return prev.filter(d => d.tipo !== tipo)
      return [...prev, { nombre, tipo }]
    })
  }

  const crear = async () => {
    if (!clientName.trim()) { alert('Ingresá el nombre del cliente'); return }
    if (firmantes.some(f => !f.email)) { alert('Completá el email de todos los firmantes'); return }
    if (documentos.length === 0) { alert('Seleccioná al menos un documento'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/docusign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name:  clientName,
          empresa,
          tipo_cliente: tipoCli,
          documentos:   documentos.map(d => ({ nombre: d.nombre, tipo: d.tipo })),
          firmantes,
          mensaje,
          fecha_limite: fechaLimite || null,
          enviar_ahora: false,
        }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error ?? 'Error'); return }
      onCreado()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-[#2D3F52]">Nuevo envío DocuSign</h2>
            <p className="text-xs text-gray-400 mt-0.5">Paso {paso} de 3</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 pt-4 flex gap-2">
          {[
            { n: 1, label: 'Configuración' },
            { n: 2, label: 'Firmantes' },
            { n: 3, label: 'Revisar' },
          ].map(s => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                paso === s.n ? 'bg-[#16A34A] text-white' :
                paso > s.n  ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-400'
              }`}>{s.n}</div>
              <span className={`text-xs ${paso === s.n ? 'text-[#2D3F52] font-medium' : 'text-gray-400'}`}>{s.label}</span>
              {s.n < 3 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ─── PASO 1: Configuración ─── */}
          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16A34A]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Empresa</label>
                  <div className="flex gap-2">
                    {(['roble', 'geliene'] as const).map(e => (
                      <button key={e} onClick={() => setEmpresa(e)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          empresa === e ? (e === 'roble' ? 'bg-green-50 border-green-400 text-green-700' : 'bg-blue-50 border-blue-400 text-blue-700')
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {e.charAt(0).toUpperCase() + e.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de cliente</label>
                  <div className="flex gap-2">
                    {(['pf', 'pj'] as const).map(t => (
                      <button key={t} onClick={() => setTipoCli(t)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          tipoCli === t ? 'bg-[#2D3F52] border-[#2D3F52] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {t === 'pf' ? 'Persona Física' : 'Persona Jurídica'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Documentos a enviar</label>
                <div className="space-y-2">
                  {[
                    { tipo: 'ficha',        nombre: 'Ficha de Cliente' },
                    { tipo: 'cuestionario', nombre: 'Cuestionario Perfil del Inversor' },
                    { tipo: 'lista',        nombre: 'Lista de Verificación' },
                  ].map(d => (
                    <label key={d.tipo} className="flex items-center gap-2.5 cursor-pointer group">
                      <div onClick={() => toggleDoc(d.tipo as any, d.nombre)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          documentos.find(x => x.tipo === d.tipo) ? 'bg-[#16A34A] border-[#16A34A]' : 'border-gray-300 group-hover:border-gray-400'
                        }`}>
                        {documentos.find(x => x.tipo === d.tipo) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-700">📄 {d.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mensaje al cliente</label>
                <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16A34A] resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha límite de firma</label>
                <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16A34A]" />
              </div>
            </div>
          )}

          {/* ─── PASO 2: Firmantes ─── */}
          {paso === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Agregá todos los firmantes en el orden de firma deseado.</p>

              {firmantes.map((f, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Firmante {i + 1}</span>
                    {firmantes.length > 1 && (
                      <button onClick={() => removeFirmante(i)} className="text-red-400 hover:text-red-600 text-xs">
                        Eliminar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                      <input value={f.nombre} onChange={e => updateFirmante(i, 'nombre', e.target.value)}
                        placeholder="Juan"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#16A34A]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Apellido *</label>
                      <input value={f.apellido} onChange={e => updateFirmante(i, 'apellido', e.target.value)}
                        placeholder="García"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#16A34A]" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Email *</label>
                      <input type="email" value={f.email} onChange={e => updateFirmante(i, 'email', e.target.value)}
                        placeholder="juan@email.com"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#16A34A]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Rol</label>
                      <select value={f.rol} onChange={e => updateFirmante(i, 'rol', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#16A34A] bg-white">
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Orden de firma</label>
                      <input type="number" min={1} value={f.orden} onChange={e => updateFirmante(i, 'orden', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#16A34A]" />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addFirmante}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-[#16A34A] hover:text-[#16A34A] transition-colors">
                + Agregar firmante
              </button>
            </div>
          )}

          {/* ─── PASO 3: Resumen ─── */}
          {paso === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <p><span className="font-semibold text-gray-600">Cliente:</span> {clientName}</p>
                <p><span className="font-semibold text-gray-600">Empresa:</span> {empresa.charAt(0).toUpperCase() + empresa.slice(1)}</p>
                <p><span className="font-semibold text-gray-600">Tipo:</span> {tipoCli === 'pf' ? 'Persona Física' : 'Persona Jurídica'}</p>
                {fechaLimite && <p><span className="font-semibold text-gray-600">Vencimiento:</span> {new Date(fechaLimite + 'T00:00:00').toLocaleDateString('es-UY')}</p>}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Documentos ({documentos.length})</p>
                {documentos.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100 text-sm text-gray-700">
                    <span>📄</span> {d.nombre}
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Firmantes ({firmantes.length})</p>
                {firmantes.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 text-sm">
                    <div className="w-7 h-7 rounded-full bg-[#2D3F52] text-white flex items-center justify-center text-xs font-bold">{f.orden}</div>
                    <div>
                      <p className="font-medium text-gray-800">{f.nombre} {f.apellido}</p>
                      <p className="text-xs text-gray-400">{f.email} · {f.rol}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <p className="font-semibold mb-1">⚠️ El envío quedará como borrador</p>
                <p>Podrás enviarlo a DocuSign desde la bandeja principal una vez que tengas las credenciales de la API configuradas.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button onClick={paso === 1 ? onClose : () => setPaso(p => (p - 1) as any)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            {paso === 1 ? 'Cancelar' : '← Atrás'}
          </button>
          <div className="flex gap-2">
            {paso < 3 ? (
              <button onClick={() => setPaso(p => (p + 1) as any)}
                className="px-5 py-2 bg-[#2D3F52] text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 transition-colors">
                Siguiente →
              </button>
            ) : (
              <button onClick={crear} disabled={saving}
                className="px-5 py-2 bg-[#16A34A] text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center gap-2">
                {saving && <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />}
                Guardar borrador
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
