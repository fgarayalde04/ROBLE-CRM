'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { globalSearch } from '@/lib/supabase/queries'
import type { Client, Document, Task, Deadline } from '@/types/platform'
import StatusBadge from './StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Results = {
  clients: Client[]
  documents: Document[]
  tasks: Task[]
  deadlines: Deadline[]
}

const categoryLabel: Record<string, string> = {
  contrato: 'Contrato', perfil_riesgo: 'Perfil de riesgo', reporte: 'Reporte',
  propuesta: 'Propuesta', documento_legal: 'Doc. legal', fact_sheet: 'Fact sheet',
  comunicacion: 'Comunicación', formulario: 'Formulario', analisis_inversion: 'Análisis', otro: 'Otro',
}

export default function SearchInterface() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)

  const total = results
    ? results.clients.length + results.documents.length + results.tasks.length + results.deadlines.length
    : 0

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true)
    try {
      const r = await globalSearch(q)
      setResults(r as any)
    } finally {
      setLoading(false)
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch(query)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Search box */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nombre, apellido, N° cliente, email, documento, tarea..."
          autoFocus
          className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
        />
        <button
          onClick={() => handleSearch(query)}
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-[#2D3F52] text-white text-sm rounded-lg hover:bg-[#354A5E] transition-colors disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {/* No query */}
      {!results && !loading && (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center">
          <p className="text-sm text-gray-400">
            Ingrese un termino y presione Enter o haga clic en Buscar.
          </p>
          <p className="text-xs text-gray-300 mt-2">
            Puede buscar por nombre, apellido, N° de cliente, email, nombre de documento o tarea.
          </p>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          <p className="text-sm text-gray-500">
            {total === 0
              ? `Sin resultados para "${query}"`
              : `${total} resultado${total !== 1 ? 's' : ''} para "${query}"`}
          </p>

          {/* Clients */}
          {results.clients.length > 0 && (
            <Section title="Clientes" count={results.clients.length}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {results.clients.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link href={`clients/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                          {c.first_name} {c.last_name}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">#{c.client_number}{c.email ? ` · ${c.email}` : ''}</p>
                      </td>
                      <td className="px-5 py-3"><StatusBadge type="client_status" value={c.status} /></td>
                      <td className="px-5 py-3">
                        {c.onedrive_folder_url && (
                          <a href={c.onedrive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            Abrir carpeta
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Documents */}
          {results.documents.length > 0 && (
            <Section title="Documentos" count={results.documents.length}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {results.documents.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{d.name}</p>
                        {d.client && (
                          <Link href={`clients/${d.client.id}`} className="text-xs text-blue-600 hover:underline">
                            {d.client.first_name} {d.client.last_name}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{categoryLabel[d.category] ?? d.category}</td>
                      <td className="px-5 py-3"><StatusBadge type="document_status" value={d.status} /></td>
                      <td className="px-5 py-3">
                        {d.onedrive_url && (
                          <a href={d.onedrive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            Abrir
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Tasks */}
          {results.tasks.length > 0 && (
            <Section title="Tareas" count={results.tasks.length}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {results.tasks.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{t.title}</p>
                        {t.client && (
                          <Link href={`clients/${t.client.id}`} className="text-xs text-blue-600 hover:underline">
                            {t.client.first_name} {t.client.last_name}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3"><StatusBadge type="priority" value={t.priority} /></td>
                      <td className="px-5 py-3"><StatusBadge type="task_status" value={t.status} /></td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {t.due_date ? format(new Date(t.due_date + 'T00:00:00'), 'd MMM yyyy', { locale: es }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Deadlines */}
          {results.deadlines.length > 0 && (
            <Section title="Vencimientos" count={results.deadlines.length}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {results.deadlines.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{d.title}</p>
                        {d.client && (
                          <Link href={`clients/${d.client.id}`} className="text-xs text-blue-600 hover:underline">
                            {d.client.first_name} {d.client.last_name}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3"><StatusBadge type="task_status" value={d.status} /></td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {format(new Date(d.due_date + 'T00:00:00'), 'd MMM yyyy', { locale: es })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {total === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center">
              <p className="text-sm text-gray-500">
                No se encontraron resultados para <span className="font-medium">"{query}"</span>.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
      </div>
      {children}
    </div>
  )
}
