'use client'

import { useEffect, useMemo, useState } from 'react'

// Enviar el PDF de un documento de Plantillas a clientes elegidos, en copia
// oculta desde inversiones@ (ver /api/plantillas/[id]/enviar).

interface Cliente {
  id: string
  nombre: string
  email: string
  client_number: string | null
  advisor: string | null
  risk_profile: string | null
  status: string | null
}

const PERFIL: Record<string, string> = {
  conservador: 'Conservador', moderado: 'Moderado', moderado_agresivo: 'Moderado agresivo', agresivo: 'Agresivo',
}

export default function EnviarClientesModal({
  docId, titulo, cuerpoInicial, onClose,
}: {
  docId: string; titulo: string; cuerpoInicial: string; onClose: () => void
}) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [asesor, setAsesor] = useState('')
  const [perfil, setPerfil] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [asunto, setAsunto] = useState(titulo)
  const [cuerpo, setCuerpo] = useState(cuerpoInicial)
  const [paso, setPaso] = useState<'elegir' | 'confirmar' | 'enviando' | 'listo'>('elegir')
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/plantillas/destinatarios')
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setClientes(d.clientes) })
      .catch((e) => setError(e.message ?? 'No se pudieron cargar los clientes'))
  }, [])

  const asesores = useMemo(
    () => Array.from(new Set((clientes ?? []).map((c) => c.advisor).filter(Boolean) as string[])).sort(),
    [clientes]
  )

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (clientes ?? []).filter((c) =>
      (!soloActivos || c.status === 'activo') &&
      (!asesor || c.advisor === asesor) &&
      (!perfil || c.risk_profile === perfil) &&
      (!t || c.nombre.toLowerCase().includes(t) || c.email.includes(t) || (c.client_number ?? '').toLowerCase().includes(t))
    )
  }, [clientes, q, asesor, perfil, soloActivos])

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosFiltrados = filtrados.length > 0 && filtrados.every((c) => sel.has(c.id))
  const marcarFiltrados = () => setSel((s) => {
    const n = new Set(s)
    if (todosFiltrados) filtrados.forEach((c) => n.delete(c.id))
    else filtrados.forEach((c) => n.add(c.id))
    return n
  })

  async function enviar() {
    setPaso('enviando'); setError(null)
    try {
      const res = await fetch(`/api/plantillas/${docId}/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: Array.from(sel), asunto, cuerpo }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResultado(`Enviado a ${data.enviados} ${data.enviados === 1 ? 'cliente' : 'clientes'} en copia oculta.${data.omitidos ? ` ${data.omitidos} sin mail válido quedaron afuera.` : ''}`)
      setPaso('listo')
    } catch (e: any) {
      setError(e.message)
      setPaso('confirmar')
    }
  }

  const input = 'w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 bg-white'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Enviar a clientes</h2>
            <p className="text-xs text-gray-400 mt-0.5">Desde inversiones@roblecapital.net, con el PDF adjunto. Cada cliente recibe el mail en copia oculta: nadie ve a los demás.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {paso === 'listo' ? (
          <div className="px-6 py-10 text-center">
            <p className="text-emerald-700 font-medium">✓ {resultado}</p>
            <p className="text-xs text-gray-400 mt-2">El envío quedó registrado en el historial de cada cliente.</p>
            <button onClick={onClose} className="mt-6 px-4 py-2 text-sm bg-[#2D3F52] text-white rounded-lg">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Destinatarios */}
              <div className="flex flex-col min-h-0">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Destinatarios · {sel.size} elegidos</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input className={`${input} col-span-2`} placeholder="Buscar por nombre, mail o número…" value={q} onChange={(e) => setQ(e.target.value)} />
                  <select className={input} value={asesor} onChange={(e) => setAsesor(e.target.value)}>
                    <option value="">Todos los asesores</option>
                    {asesores.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select className={input} value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                    <option value="">Todos los perfiles</option>
                    {Object.entries(PERFIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
                    Solo clientes activos
                  </label>
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <button type="button" onClick={marcarFiltrados} disabled={!filtrados.length} className="text-blue-600 hover:underline disabled:opacity-40">
                    {todosFiltrados ? `Quitar los ${filtrados.length} de la lista` : `Elegir los ${filtrados.length} de la lista`}
                  </button>
                  {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="text-gray-400 hover:text-red-500">Vaciar</button>}
                </div>
                <div className="border border-gray-200 rounded-lg overflow-y-auto h-64 md:h-80 divide-y divide-gray-50">
                  {!clientes && !error && <p className="p-3 text-sm text-gray-400">Cargando clientes…</p>}
                  {clientes && filtrados.length === 0 && <p className="p-3 text-sm text-gray-400">Ningún cliente coincide.</p>}
                  {filtrados.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="mt-1" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-900 truncate">{c.nombre || '—'}</span>
                        <span className="block text-xs text-gray-400 truncate">
                          {c.email}{c.advisor ? ` · ${c.advisor}` : ''}{c.risk_profile ? ` · ${PERFIL[c.risk_profile] ?? c.risk_profile}` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mail */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Mail</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Asunto</label>
                  <input className={input} value={asunto} onChange={(e) => setAsunto(e.target.value)} />
                </div>
                <div className="flex-1 flex flex-col">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Texto</label>
                  <textarea className={`${input} flex-1 min-h-[220px] resize-y`} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
                </div>
                <p className="text-xs text-gray-500">📎 {titulo}.pdf</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-red-600">{error}</span>
              <div className="flex items-center gap-2 ml-auto">
                {paso === 'elegir' ? (
                  <>
                    <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                    <button
                      onClick={() => setPaso('confirmar')}
                      disabled={!sel.size || !asunto.trim() || !cuerpo.trim()}
                      className="px-4 py-2 text-sm bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-50 font-medium"
                    >
                      Revisar envío ({sel.size})
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-gray-700">¿Enviar a <b>{sel.size}</b> {sel.size === 1 ? 'cliente' : 'clientes'} en copia oculta?</span>
                    <button onClick={() => setPaso('elegir')} disabled={paso === 'enviando'} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Volver</button>
                    <button onClick={enviar} disabled={paso === 'enviando'} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                      {paso === 'enviando' ? 'Enviando…' : 'Enviar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
