'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ProfileForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  risk_profile: string
}

const EMPTY: ProfileForm = { first_name: '', last_name: '', email: '', phone: '', risk_profile: '' }

const inputClass = 'w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20'

// Sin cliente vinculado no hay perfil que completar; con cliente, antes de
// comenzar se pide completar el perfil (nombre, mail, celular) para que esa
// sección de la ficha quede siempre completa en cada cuenta nueva.
export default function StartOpeningButton({ openingId, clientId }: { openingId: string; clientId?: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [form, setForm] = useState<ProfileForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  async function startOpening(): Promise<boolean> {
    const res = await fetch('/api/openings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: openingId,
        status: 'recolectando_informacion',
        start_date: new Date().toISOString().split('T')[0],
      }),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const missing: string[] = data?.link?.missing ?? []
      if (missing.length > 0) {
        alert(`La apertura comenzó, pero al cliente le falta vincular: ${missing.join(', ')}.\nRevisalo en su ficha o en Banco Central.`)
      }
    }
    return res.ok
  }

  async function handleClick() {
    setError(null)
    if (!clientId) {
      await finish()
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/by-id?id=${encodeURIComponent(clientId)}`)
      const c = res.ok ? await res.json() : null
      if (!c) {
        // No se pudo leer el cliente — no trabar la apertura por eso.
        await finish()
        return
      }
      setForm({
        first_name: c.first_name ?? '',
        last_name: c.last_name ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        risk_profile: c.risk_profile ?? '',
      })
      setShowProfile(true)
      setLoading(false)
    } catch {
      await finish()
    }
  }

  async function finish() {
    setLoading(true)
    try {
      if (!(await startOpening())) throw new Error('No se pudo comenzar la apertura.')
      // Al detalle, donde está el checklist paso a paso.
      router.push(`/openings/${openingId}`)
    } catch (e: any) {
      setError(e.message ?? 'No se pudo comenzar la apertura.')
      setLoading(false)
    }
  }

  async function saveAndStart() {
    const missing = [
      !form.first_name.trim() && 'nombre',
      !form.last_name.trim() && 'apellido',
      !form.email.trim() && 'mail',
      !form.phone.trim() && 'celular',
    ].filter(Boolean)
    if (missing.length > 0) {
      setError(`Falta completar: ${missing.join(', ')}.`)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clientId,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          risk_profile: form.risk_profile || null,
        }),
      })
      if (!res.ok) throw new Error('No se pudo guardar el perfil del cliente.')
      await finish()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo guardar el perfil del cliente.')
      setLoading(false)
    }
  }

  const set = (k: keyof ProfileForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs px-3 py-1 rounded font-medium text-white transition-colors disabled:opacity-60 whitespace-nowrap"
        style={{ backgroundColor: loading ? '#6b7280' : '#16A34A' }}
        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#15803d' }}
        onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#16A34A' }}
      >
        {loading && !showProfile ? '...' : 'Comenzar apertura'}
      </button>
      {!showProfile && error && <span className="text-xs text-red-600">{error}</span>}

      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900">Completá el perfil del cliente</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Antes de comenzar la apertura, dejá completos los datos del cliente en la app.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500">Nombre *</span>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Apellido *</span>
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inputClass} />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-500">Mail *</span>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-500">Celular *</span>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-500">Perfil de riesgo (si ya lo tenés)</span>
                <select value={form.risk_profile} onChange={e => set('risk_profile', e.target.value)} className={inputClass}>
                  <option value="">— Sin asignar —</option>
                  <option value="conservador">Conservador</option>
                  <option value="moderado">Moderado</option>
                  <option value="moderado_agresivo">Moderado agresivo</option>
                  <option value="agresivo">Agresivo</option>
                </select>
              </label>
            </div>

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowProfile(false); setError(null) }}
                disabled={loading}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveAndStart}
                disabled={loading}
                className="px-3 py-1.5 text-sm rounded-lg font-medium text-white bg-[#16A34A] hover:bg-[#15803d] disabled:opacity-60"
              >
                {loading ? 'Guardando…' : 'Guardar y comenzar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
