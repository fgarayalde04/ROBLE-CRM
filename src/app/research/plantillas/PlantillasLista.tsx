'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TIPOS_PLANTILLA, type TipoPlantilla } from '@/lib/plantillas/tipos'

interface Doc {
  id: string
  tipo: TipoPlantilla
  titulo: string
  created_by: string | null
  updated_by: string | null
  updated_at: string
}

export default function PlantillasLista({ documentos }: { documentos: Doc[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<TipoPlantilla | 'todos'>('todos')
  const [q, setQ] = useState('')

  async function crear(body: Record<string, unknown>, key: string) {
    setBusy(key)
    try {
      const res = await fetch('/api/plantillas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      router.push(`/research/plantillas/${data.documento.id}`)
    } catch (e: any) {
      alert(e.message)
      setBusy(null)
    }
  }

  async function borrar(d: Doc) {
    if (!confirm(`¿Borrar "${d.titulo}"?`)) return
    setBusy(d.id)
    await fetch(`/api/plantillas/${d.id}`, { method: 'DELETE' })
    setBusy(null)
    router.refresh()
  }

  const visibles = documentos.filter((d) =>
    (filtro === 'todos' || d.tipo === filtro) && (!q.trim() || d.titulo.toLowerCase().includes(q.trim().toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(TIPOS_PLANTILLA) as TipoPlantilla[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!!busy}
            onClick={() => crear({ tipo: t }, `nuevo-${t}`)}
            className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-[#2D3F52] hover:shadow-sm transition disabled:opacity-60"
          >
            <p className="text-sm font-semibold text-[#2D3F52]">
              {busy === `nuevo-${t}` ? 'Creando…' : `+ Nueva ${TIPOS_PLANTILLA[t].label.toLowerCase()}`}
            </p>
            <p className="text-xs text-gray-500 mt-1">{TIPOS_PLANTILLA[t].descripcion}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800">Documentos</h2>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs w-40"
            />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white">
              <option value="todos">Todos</option>
              {(Object.keys(TIPOS_PLANTILLA) as TipoPlantilla[]).map((t) => (
                <option key={t} value={t}>{TIPOS_PLANTILLA[t].label}</option>
              ))}
            </select>
          </div>
        </div>
        {visibles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">
            {documentos.length === 0 ? 'Todavía no hay documentos. Creá uno arriba.' : 'Ningún documento coincide.'}
          </p>
        ) : (
          <div className="mobile-scroll-x">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {visibles.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5">
                      <a href={`/research/plantillas/${d.id}`} className="font-medium text-gray-900 hover:underline">{d.titulo}</a>
                      <p className="text-xs text-gray-400">
                        {TIPOS_PLANTILLA[d.tipo]?.label ?? d.tipo} · {d.updated_by ?? d.created_by ?? '—'} ·{' '}
                        {new Date(d.updated_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <a href={`/api/plantillas/${d.id}/pdf`} className="text-xs text-blue-600 hover:underline mr-3">PDF</a>
                      <button type="button" disabled={!!busy} onClick={() => crear({ duplicar: d.id }, `dup-${d.id}`)} className="text-xs text-blue-600 hover:underline mr-3 disabled:opacity-50">
                        {busy === `dup-${d.id}` ? 'Duplicando…' : 'Duplicar'}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => borrar(d)} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
