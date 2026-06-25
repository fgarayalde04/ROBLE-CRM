'use client'
import { useState, useEffect, useRef } from 'react'
import type { Empresa, TipoCliente } from './types'

interface Client { id: string; first_name: string; last_name: string; client_number: string }

interface Props {
  onConfirm: (empresa: Empresa, tipo: TipoCliente, client: Client | null, clientName: string) => void
}

export default function FichaWizard({ onConfirm }: Props) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [tipo, setTipo] = useState<TipoCliente | null>(null)
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<Client | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [customName, setCustomName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim() || selected) { setClients([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`)
      if (res.ok) setClients(await res.json())
    }, 250)
    return () => clearTimeout(timer)
  }, [query, selected])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const canProceed = empresa && tipo

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#2D3F52]">Nueva Ficha BCU</h1>
          <p className="text-sm text-gray-500 mt-1">Seleccioná empresa, tipo de cliente y buscá al cliente</p>
        </div>

        {/* Step 1 — Empresa */}
        <Step number={1} label="Seleccionar Empresa">
          <div className="flex gap-3">
            {(['roble', 'geliene'] as Empresa[]).map((e) => (
              <button
                key={e}
                onClick={() => setEmpresa(e)}
                className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                  empresa === e
                    ? 'border-[#16A34A] bg-green-50 text-[#16A34A]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {e === 'roble' ? 'ROBLE' : 'GELIENE'}
              </button>
            ))}
          </div>
        </Step>

        {/* Step 2 — Tipo */}
        <Step number={2} label="Tipo de Cliente">
          <div className="flex gap-3">
            {[
              { key: 'pf' as TipoCliente, label: 'Persona Física' },
              { key: 'pj' as TipoCliente, label: 'Persona Jurídica' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTipo(key)}
                className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                  tipo === key
                    ? 'border-[#16A34A] bg-green-50 text-[#16A34A]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Step>

        {/* Step 3 — Cliente */}
        <Step number={3} label="Seleccionar Cliente">
          <div ref={ref} className="relative">
            {selected ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div>
                  <p className="font-semibold text-sm text-[#2D3F52]">{selected.last_name}, {selected.first_name}</p>
                  <p className="text-xs text-gray-400">Código: {selected.client_number}</p>
                </div>
                <button onClick={() => { setSelected(null); setQuery('') }} className="text-xs text-gray-400 hover:text-red-500 ml-3">✕</button>
              </div>
            ) : (
              <>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#16A34A] bg-white"
                  placeholder="Buscar por nombre o código..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); setCustomName(e.target.value) }}
                  onFocus={() => setShowDropdown(true)}
                />
                {showDropdown && clients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        onClick={() => { setSelected(c); setCustomName(`${c.last_name}, ${c.first_name}`); setShowDropdown(false) }}
                      >
                        <span className="font-medium text-[#2D3F52]">{c.last_name}, {c.first_name}</span>
                        <span className="ml-2 text-xs text-gray-400">#{c.client_number}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">Si el cliente no está en el sistema, escribí su nombre manualmente.</p>
              </>
            )}
          </div>
        </Step>

        <button
          disabled={!canProceed}
          onClick={() => {
            if (!empresa || !tipo) return
            onConfirm(empresa, tipo, selected, selected ? `${selected.last_name}, ${selected.first_name}` : customName.trim())
          }}
          className="w-full mt-6 py-3.5 rounded-xl font-semibold text-sm transition-all bg-[#16A34A] text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Generar documentos
        </button>
      </div>
    </div>
  )
}

function Step({ number, label, children }: { number: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-white border border-[#E2E8F0] rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-[#2D3F52] text-white text-xs font-bold flex items-center justify-center shrink-0">{number}</span>
        <p className="font-semibold text-sm text-[#2D3F52]">{label}</p>
      </div>
      {children}
    </div>
  )
}
