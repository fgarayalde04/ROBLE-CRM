'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DescarteRow } from '@/lib/db/descartes'

export default function EliminadosClient({ rows }: { rows: DescarteRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function restaurar(r: DescarteRow) {
    if (!confirm(`¿Restaurar a ${r.nombre ?? r.client_number ?? 'este cliente'}? La sincronización lo vuelve a crear desde su carpeta o legajo.`)) return
    setBusy(r.id); setError(null)
    try {
      const res = await fetch('/api/clients/descartes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo restaurar')
      router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const needle = q.trim().toLowerCase()
  const visible = needle
    ? rows.filter(r => (r.nombre ?? '').toLowerCase().includes(needle) || (r.client_number ?? '').includes(needle))
    : rows

  if (rows.length === 0) {
    return <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center text-sm text-gray-500">No hay clientes eliminados.</div>
  }

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por nombre o número..."
        className="w-full max-w-sm text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A]"
      />
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden mobile-scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2">Nombre</th><th className="px-4 py-2">N° Banco Central</th>
              <th className="px-4 py-2">Motivo</th><th className="px-4 py-2">Fecha</th><th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 text-gray-800">{r.nombre ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2 text-gray-600">{r.client_number ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2 text-gray-500">{r.motivo ?? ''}</td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('es-UY')}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => restaurar(r)}
                    disabled={busy !== null}
                    className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {busy === r.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
