'use client'

import { useState } from 'react'
import Link from 'next/link'
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

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function PlantillasLista({ tipo, documentos }: { tipo: TipoPlantilla | null; documentos: Doc[] }) {
  if (!tipo) return <Tarjetas documentos={documentos} />
  return <DocumentosDeTipo tipo={tipo} documentos={documentos.filter((d) => d.tipo === tipo)} />
}

// ── Inicio: una tarjeta por plantilla ───────────────────────────────────────

function Tarjetas({ documentos }: { documentos: Doc[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
      {(Object.keys(TIPOS_PLANTILLA) as TipoPlantilla[]).map((t) => {
        const docs = documentos.filter((d) => d.tipo === t)
        return (
          <Link
            key={t}
            href={`/plantillas?tipo=${t}`}
            className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-[#2D3F52] hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-[#2D3F52]">{TIPOS_PLANTILLA[t].plural}</p>
              <span className="text-gray-300 group-hover:text-[#2D3F52] transition">→</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{TIPOS_PLANTILLA[t].descripcion}</p>
            <p className="text-xs text-gray-400 mt-4">
              {docs.length === 0
                ? 'Todavía no hay documentos'
                : `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'} · último ${fmt(docs[0].updated_at)}`}
            </p>
          </Link>
        )
      })}
    </div>
  )
}

// ── Una plantilla: crear nuevo + todos los ya hechos ────────────────────────

function DocumentosDeTipo({ tipo, documentos }: { tipo: TipoPlantilla; documentos: Doc[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function crear(body: Record<string, unknown>, key: string) {
    setBusy(key)
    try {
      const res = await fetch('/api/plantillas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      router.push(`/plantillas/${data.documento.id}`)
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

  const visibles = documentos.filter((d) => !q.trim() || d.titulo.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="space-y-4 max-w-4xl">
      <button
        type="button"
        disabled={!!busy}
        onClick={() => crear({ tipo }, 'nuevo')}
        className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold bg-[#2D3F52] text-white rounded-lg hover:bg-[#354A5E] disabled:opacity-60"
      >
        {busy === 'nuevo' ? 'Creando…' : '+ Crear nuevo'}
      </button>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800">
            Ya hechos <span className="text-gray-400 font-normal">· {documentos.length}</span>
          </h2>
          {documentos.length > 5 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs w-48"
            />
          )}
        </div>
        {visibles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">
            {documentos.length === 0 ? 'Todavía no hay ninguno. Creá el primero con el botón de arriba.' : 'Ninguno coincide con la búsqueda.'}
          </p>
        ) : (
          <div className="mobile-scroll-x">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {visibles.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link href={`/plantillas/${d.id}`} className="font-medium text-gray-900 hover:underline">{d.titulo}</Link>
                      <p className="text-xs text-gray-400">
                        {fmt(d.updated_at)} · {d.updated_by ?? d.created_by ?? '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Link href={`/plantillas/${d.id}`} className="text-xs text-blue-600 hover:underline mr-3">Abrir</Link>
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
