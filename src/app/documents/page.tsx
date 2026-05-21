import type { Metadata } from 'next'
import Link from 'next/link'
import { getDocuments } from '@/lib/supabase/queries'
import type { Document, Client } from '@/types/platform'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type DocWithClient = Document & { client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null }

export const metadata: Metadata = { title: 'Documentos' }
export const dynamic = 'force-dynamic'

const categoryLabel: Record<string, string> = {
  contrato: 'Contrato', perfil_riesgo: 'Perfil de riesgo', reporte: 'Reporte',
  propuesta: 'Propuesta', documento_legal: 'Doc. legal', fact_sheet: 'Fact sheet',
  comunicacion: 'Comunicación', formulario: 'Formulario', analisis_inversion: 'Análisis de inv.', otro: 'Otro',
}

interface Props {
  searchParams: { q?: string; status?: string; category?: string; clientId?: string }
}

export default async function DocumentsPage({ searchParams }: Props) {
  let documents: DocWithClient[]
  try {
    documents = await getDocuments({
      search: searchParams.q,
      status: searchParams.status,
      category: searchParams.category,
      clientId: searchParams.clientId,
    })
  } catch {
    documents = []
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Documentos</h1>
          <p className="mt-1 text-sm text-gray-500">{documents.length} registros</p>
        </div>
        <Link
          href="/documents/new"
          className="px-4 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors"
        >
          Nuevo documento
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-center">
        <form className="flex gap-2 items-center flex-1 min-w-48">
          <input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Buscar por nombre..."
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button type="submit" className="px-3 py-1.5 bg-gray-100 text-sm text-gray-700 rounded hover:bg-gray-200">
            Buscar
          </button>
        </form>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Todos', value: '' },
            { label: 'Pendiente', value: 'pendiente' },
            { label: 'Revisar', value: 'revisar' },
            { label: 'Completo', value: 'completo' },
            { label: 'Vencido', value: 'vencido' },
            { label: 'Enviado', value: 'enviado' },
            { label: 'Firmado', value: 'firmado' },
          ].map((f) => (
            <Link
              key={f.value}
              href={`/documents${f.value ? `?status=${f.value}` : ''}`}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                (searchParams.status ?? '') === f.value
                  ? 'bg-[#2D3F52] text-white border-[#2D3F52]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No se encontraron documentos.</p>
            <Link href="/documents/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
              Agregar el primer documento
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimiento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Responsable</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {documents.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3">
                    {d.client ? (
                      <Link href={`/clients/${d.client.id}`} className="text-blue-600 hover:underline">
                        {d.client.first_name} {d.client.last_name}
                      </Link>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{categoryLabel[d.category] ?? d.category}</td>
                  <td className="px-4 py-3"><StatusBadge type="document_status" value={d.status} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {d.expiry_date
                      ? format(new Date(d.expiry_date + 'T00:00:00'), 'd MMM yyyy', { locale: es })
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{d.responsible ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {d.onedrive_url ? (
                      <a href={d.onedrive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        Abrir
                      </a>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
