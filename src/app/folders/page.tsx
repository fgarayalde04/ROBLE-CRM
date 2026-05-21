import type { Metadata } from 'next'
import Link from 'next/link'
import { getNewFolders } from '@/lib/supabase/queries'
import type { NewFolder, FolderStatus } from '@/types/platform'
import FolderActions from '@/components/FolderActions'
import SyncLocalButton from '@/components/SyncLocalButton'

export const metadata: Metadata = { title: 'Nuevas carpetas' }
export const dynamic = 'force-dynamic'

const statusLabel: Record<FolderStatus, string> = {
  pendiente:   'Pendiente',
  en_proceso:  'En proceso',
  ignorada:    'Ignorada',
  archivada:   'Archivada',
}

const statusColor: Record<FolderStatus, string> = {
  pendiente:   'bg-amber-50 text-amber-700 border-amber-200',
  en_proceso:  'bg-blue-50 text-blue-700 border-blue-200',
  ignorada:    'bg-gray-100 text-gray-500 border-gray-200',
  archivada:   'bg-gray-100 text-gray-400 border-gray-200',
}

interface Props {
  searchParams: { status?: string }
}

export default async function FoldersPage({ searchParams }: Props) {
  let folders: NewFolder[]
  try {
    folders = await getNewFolders(searchParams.status)
  } catch {
    folders = []
  }

  const configuredPath = process.env.LOCAL_CLIENTS_FOLDER_PATH ?? null
  const pending = folders.filter((f) => f.status === 'pendiente').length
  const localFolders = folders.filter((f) => (f as any).source === 'local_folder').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Nuevas carpetas</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pending > 0
              ? `${pending} carpeta${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''} de clasificar`
              : `${folders.length} carpetas registradas`
            }
          </p>
        </div>
        <Link
          href="/folders/new"
          className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50 transition-colors"
        >
          Agregar manual
        </Link>
      </div>

      {/* Sincronización local */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Sincronizacion de carpeta local</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Lee las subcarpetas de la ruta configurada y las registra como carpetas nuevas.
              {localFolders > 0 && ` ${localFolders} carpeta${localFolders > 1 ? 's' : ''} ya sincronizada${localFolders > 1 ? 's' : ''}.`}
            </p>
          </div>
        </div>
        <SyncLocalButton configuredPath={configuredPath} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 mb-4 flex flex-wrap gap-2">
        {[{ label: 'Todas', value: '' }, ...Object.entries(statusLabel).map(([v, l]) => ({ label: l, value: v }))].map((f) => (
          <Link
            key={f.value}
            href={`/folders${f.value ? `?status=${f.value}` : ''}`}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              (searchParams.status ?? '') === f.value
                ? 'text-white border-transparent'
                : 'bg-white text-gray-600 border-[#E2E8F0] hover:border-gray-400'
            }`}
            style={(searchParams.status ?? '') === f.value ? { backgroundColor: '#2D3F52' } : {}}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* List */}
      {folders.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-lg px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No hay carpetas registradas.</p>
          <Link href="/folders/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Agregar primera carpeta
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Carpeta</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Origen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Detectada</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {folders.map((folder) => (
                <tr key={folder.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{folder.folder_name}</p>
                    {folder.folder_path && (
                      <p className="text-[10px] text-gray-300 font-mono mt-0.5 truncate max-w-xs" title={folder.folder_path}>
                        {folder.folder_path}
                      </p>
                    )}
                    {folder.notes && <p className="text-xs text-gray-400 mt-0.5">{folder.notes}</p>}
                    {folder.onedrive_url && (
                      <a
                        href={folder.onedrive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Abrir carpeta
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                      folder.source === 'local_folder'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : folder.source === 'onedrive'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {folder.source === 'local_folder' ? 'Local' : folder.source === 'onedrive' ? 'OneDrive' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(folder.detected_at).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusColor[folder.status as FolderStatus]}`}>
                      {statusLabel[folder.status as FolderStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <FolderActions folder={folder} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
