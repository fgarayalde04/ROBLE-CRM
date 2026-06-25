'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import NuevoEnvioModal from './NuevoEnvioModal'

interface Envelope {
  id: string
  envelope_id: string | null
  client_name: string
  empresa: string
  tipo_cliente: string
  documentos: { nombre: string }[]
  firmantes: { nombre: string; apellido: string; email: string; rol: string }[]
  estado: string
  mensaje: string
  fecha_limite: string | null
  responsable_name: string | null
  ds_sent_at: string | null
  ds_completed_at: string | null
  created_at: string
  updated_at: string
}

const ESTADO_LABEL: Record<string, string> = {
  borrador:          'Borrador',
  pendiente_envio:   'Pendiente de envío',
  enviado:           'Enviado',
  visto:             'Visto por cliente',
  pendiente_firma:   'Pendiente de firma',
  firmado_parcial:   'Firmado parcialmente',
  firmado_completo:  'Firmado completo',
  rechazado:         'Rechazado',
  vencido:           'Vencido',
  cancelado:         'Cancelado',
}

const ESTADO_COLOR: Record<string, string> = {
  borrador:          'bg-gray-100 text-gray-600',
  pendiente_envio:   'bg-amber-100 text-amber-700',
  enviado:           'bg-blue-100 text-blue-700',
  visto:             'bg-indigo-100 text-indigo-700',
  pendiente_firma:   'bg-orange-100 text-orange-700',
  firmado_parcial:   'bg-yellow-100 text-yellow-700',
  firmado_completo:  'bg-green-100 text-green-700',
  rechazado:         'bg-red-100 text-red-600',
  vencido:           'bg-red-100 text-red-700',
  cancelado:         'bg-gray-100 text-gray-500',
}

const FILTRO_ESTADOS = [
  'todos', 'borrador', 'enviado', 'visto', 'pendiente_firma',
  'firmado_parcial', 'firmado_completo', 'rechazado', 'cancelado',
]

export default function DocuSignDashboard({ user }: { user: any }) {
  const [envelopes, setEnvelopes]     = useState<Envelope[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroEmpresa, setFiltroEmpresa] = useState('todos')
  const [busqueda, setBusqueda]       = useState('')
  const [showNuevo, setShowNuevo]     = useState(false)
  const [accionLoading, setAccionLoading] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado  !== 'todos') params.set('estado',  filtroEstado)
    if (filtroEmpresa !== 'todos') params.set('empresa', filtroEmpresa)
    const res = await fetch(`/api/docusign?${params}`)
    if (res.ok) setEnvelopes(await res.json())
    setLoading(false)
  }, [filtroEstado, filtroEmpresa])

  useEffect(() => { cargar() }, [cargar])

  const accion = async (id: string, accionNombre: string, extra?: object) => {
    setAccionLoading(id + accionNombre)
    try {
      if (accionNombre === 'descargar_firmado' || accionNombre === 'descargar_certificado') {
        const res = await fetch(`/api/docusign/${id}/accion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: accionNombre }),
        })
        if (!res.ok) { alert('Error descargando'); return }
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a'); a.href = url
        a.download = accionNombre === 'descargar_firmado' ? 'documento-firmado.pdf' : 'certificado.pdf'
        a.click(); URL.revokeObjectURL(url)
        return
      }
      const res = await fetch(`/api/docusign/${id}/accion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: accionNombre, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Error'); return }
      if (accionNombre === 'sync') alert(`Estado actualizado: ${ESTADO_LABEL[data.estado] ?? data.estado}`)
      await cargar()
    } finally {
      setAccionLoading(null)
    }
  }

  const eliminarBorrador = async (id: string) => {
    if (!confirm('¿Eliminar este borrador?')) return
    await fetch(`/api/docusign/${id}`, { method: 'DELETE' })
    await cargar()
  }

  const filtrados = envelopes.filter(e => {
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (!e.client_name.toLowerCase().includes(b) &&
          !e.firmantes.some(f => `${f.nombre} ${f.apellido}`.toLowerCase().includes(b))) return false
    }
    return true
  })

  // KPIs
  const kpis = {
    total:    envelopes.length,
    enviados: envelopes.filter(e => ['enviado','visto','pendiente_firma','firmado_parcial'].includes(e.estado)).length,
    firmados: envelopes.filter(e => e.estado === 'firmado_completo').length,
    pendientes: envelopes.filter(e => ['enviado','visto','pendiente_firma','firmado_parcial'].includes(e.estado)).length,
  }

  return (
    <div className="p-4 md:p-8" style={{ backgroundColor: '#F4F6F8', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#2D3F52' }}>DocuSign</h1>
          <p className="text-sm text-gray-500 mt-0.5">Firma electrónica de documentos</p>
        </div>
        <button
          onClick={() => setShowNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#16A34A' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo envío DocuSign
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total envíos', value: kpis.total, color: 'text-[#2D3F52]' },
          { label: 'En curso',     value: kpis.pendientes, color: 'text-blue-600' },
          { label: 'Firmados',     value: kpis.firmados, color: 'text-green-600' },
          { label: 'Pendientes',   value: kpis.enviados, color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 mb-4 flex flex-wrap gap-3 items-center">
        <input
          placeholder="Buscar cliente o firmante…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-[#16A34A]"
        />

        <div className="flex gap-1 flex-wrap">
          {['todos', 'roble', 'geliene'].map(e => (
            <button key={e} onClick={() => setFiltroEmpresa(e)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filtroEmpresa === e ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {e === 'todos' ? 'Todas' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap">
          {FILTRO_ESTADOS.map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filtroEstado === e ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {e === 'todos' ? 'Todos' : ESTADO_LABEL[e] ?? e}
            </button>
          ))}
        </div>

        <button onClick={cargar} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">✍️</div>
            <p className="text-gray-500 text-sm">No hay envíos todavía.</p>
            <p className="text-gray-400 text-xs mt-1">Hacé clic en "Nuevo envío DocuSign" para empezar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Cliente', 'Empresa', 'Documentos', 'Firmantes', 'Estado', 'Envío', 'Vencimiento', 'Responsable', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(env => (
                  <tr key={env.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#2D3F52] text-sm">{env.client_name}</p>
                      <p className="text-xs text-gray-400">{env.tipo_cliente === 'pf' ? 'Persona Física' : 'Persona Jurídica'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${env.empresa === 'roble' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {env.empresa}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {(env.documentos as any[]).slice(0, 2).map((d: any, i: number) => (
                          <p key={i} className="text-xs text-gray-600 truncate max-w-[140px]">📄 {d.nombre ?? d}</p>
                        ))}
                        {(env.documentos as any[]).length > 2 && (
                          <p className="text-xs text-gray-400">+{(env.documentos as any[]).length - 2} más</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {(env.firmantes as any[]).slice(0, 2).map((f: any, i: number) => (
                          <p key={i} className="text-xs text-gray-600">{f.nombre} {f.apellido}</p>
                        ))}
                        {(env.firmantes as any[]).length > 2 && (
                          <p className="text-xs text-gray-400">+{(env.firmantes as any[]).length - 2} más</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${ESTADO_COLOR[env.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ESTADO_LABEL[env.estado] ?? env.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {env.ds_sent_at ? new Date(env.ds_sent_at).toLocaleDateString('es-UY') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {env.fecha_limite ? (
                        <span className={new Date(env.fecha_limite) < new Date() && env.estado !== 'firmado_completo' ? 'text-red-500 font-semibold' : ''}>
                          {new Date(env.fecha_limite).toLocaleDateString('es-UY')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{env.responsable_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <AccionesEnvelope env={env} onAccion={accion} onEliminar={eliminarBorrador} loading={accionLoading} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNuevo && (
        <NuevoEnvioModal
          onClose={() => setShowNuevo(false)}
          onCreado={() => { setShowNuevo(false); cargar() }}
        />
      )}
    </div>
  )
}

function AccionesEnvelope({
  env, onAccion, onEliminar, loading,
}: {
  env: Envelope
  onAccion: (id: string, accion: string, extra?: object) => Promise<void>
  onEliminar: (id: string) => Promise<void>
  loading: string | null
}) {
  const [open, setOpen] = useState(false)
  const isLoading = (a: string) => loading === env.id + a
  const enviado = !!env.envelope_id

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52 text-sm">
            {enviado && (
              <>
                <MenuItem onClick={() => { setOpen(false); onAccion(env.id, 'sync') }} loading={isLoading('sync')}>
                  🔄 Actualizar estado
                </MenuItem>
                {['enviado','visto','pendiente_firma','firmado_parcial'].includes(env.estado) && (
                  <MenuItem onClick={() => { setOpen(false); onAccion(env.id, 'recordatorio') }} loading={isLoading('recordatorio')}>
                    📧 Reenviar recordatorio
                  </MenuItem>
                )}
                {env.estado === 'firmado_completo' && (
                  <>
                    <MenuItem onClick={() => { setOpen(false); onAccion(env.id, 'descargar_firmado') }} loading={isLoading('descargar_firmado')}>
                      ⬇️ Descargar firmado
                    </MenuItem>
                    <MenuItem onClick={() => { setOpen(false); onAccion(env.id, 'descargar_certificado') }} loading={isLoading('descargar_certificado')}>
                      📋 Descargar certificado
                    </MenuItem>
                  </>
                )}
                {!['firmado_completo','cancelado','vencido','rechazado'].includes(env.estado) && (
                  <MenuItem
                    onClick={() => {
                      setOpen(false)
                      const motivo = prompt('Motivo de cancelación (opcional):') ?? 'Cancelado desde CRM'
                      onAccion(env.id, 'cancelar', { motivo })
                    }}
                    danger
                  >
                    🚫 Cancelar envío
                  </MenuItem>
                )}
              </>
            )}
            {env.estado === 'borrador' && (
              <MenuItem onClick={() => { setOpen(false); onEliminar(env.id) }} danger>
                🗑 Eliminar borrador
              </MenuItem>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  children, onClick, loading = false, danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}
    >
      {loading ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : null}
      {children}
    </button>
  )
}
