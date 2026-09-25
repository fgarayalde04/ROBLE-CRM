'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { DuplicateGroup } from '@/lib/db/clientMerge'

export default function DuplicatesClient({ initialGroups }: { initialGroups: DuplicateGroup[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(0)

  const safeGroups = initialGroups.filter(g => g.safe)

  async function merge(keepId: string, dropIds: string[]) {
    const res = await fetch('/api/clients/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, dropIds }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo fusionar')
  }

  async function mergeGroup(g: DuplicateGroup, keepId: string) {
    const name = g.clients.find(c => c.id === keepId)
    if (!confirm(`¿Conservar a ${name?.first_name ?? ''} ${name?.last_name ?? ''} (${name?.client_number ?? 'sin número'}) y fusionar ${g.clients.length - 1} duplicado(s) en él? No se puede deshacer.`)) return
    setBusy(g.key); setError(null)
    try {
      await merge(keepId, g.clients.filter(c => c.id !== keepId).map(c => c.id))
      router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  async function mergeAllSafe() {
    if (!confirm(`¿Fusionar los ${safeGroups.length} pares seguros? En cada uno se conserva el cliente con número de Banco Central y se le suma la carpeta del otro. No se puede deshacer.`)) return
    setBusy('all'); setError(null); setDone(0)
    try {
      for (const g of safeGroups) {
        await merge(g.suggested_keep, g.clients.filter(c => c.id !== g.suggested_keep).map(c => c.id))
        setDone(d => d + 1)
      }
      router.refresh()
    } catch (e: any) { setError(e.message); router.refresh() } finally { setBusy(null) }
  }

  if (initialGroups.length === 0) {
    return <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center text-sm text-gray-500">No hay clientes duplicados. ✅</div>
  }

  return (
    <div className="space-y-4">
      {safeGroups.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p className="text-sm text-emerald-800">
            <strong>{safeGroups.length}</strong> pares seguros: uno con número de Banco Central y sin carpeta, el otro con carpeta y sin número.
          </p>
          <button
            onClick={mergeAllSafe}
            disabled={busy !== null}
            className="shrink-0 px-3 py-1.5 text-sm rounded-lg font-medium text-white bg-[#16A34A] hover:bg-[#15803d] disabled:opacity-60"
          >
            {busy === 'all' ? `Fusionando… ${done}/${safeGroups.length}` : 'Fusionar todos los seguros'}
          </button>
        </div>
      )}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>}

      {initialGroups.map(g => (
        <div key={g.key} className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{g.clients[0].first_name} {g.clients[0].last_name}</span>
            {g.safe && <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">par seguro</span>}
          </div>
          <div className="mobile-scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">Cliente</th><th className="px-4 py-2">N° Banco Central</th>
                  <th className="px-4 py-2">Carpeta</th><th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Aperturas</th><th className="px-4 py-2">Legajos BC</th><th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {g.clients.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">
                      <Link href={`/clients/${c.id}`} className="text-blue-600 hover:underline">{c.first_name} {c.last_name}</Link>
                      <div className="text-[11px] text-gray-400">{c.email ?? '—'} · {c.phone ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{c.client_number ?? '—'}</td>
                    <td className="px-4 py-2 text-xs">{c.has_folder ? '✓ sí' : '— no'}</td>
                    <td className="px-4 py-2 text-xs">{c.status === 'prospecto' ? 'pendiente' : c.status}</td>
                    <td className="px-4 py-2 text-xs">{c.openings}</td>
                    <td className="px-4 py-2 text-xs">{c.bc_records}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => mergeGroup(g, c.id)}
                        disabled={busy !== null}
                        className={`px-2.5 py-1 text-xs rounded border disabled:opacity-50 ${c.id === g.suggested_keep ? 'border-[#16A34A] text-[#16A34A] hover:bg-green-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {busy === g.key ? '…' : c.id === g.suggested_keep ? 'Conservar este (sugerido)' : 'Conservar este'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
