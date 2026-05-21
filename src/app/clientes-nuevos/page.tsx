import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Client } from '@/types/platform'
import AutoRefresh from '@/components/AutoRefresh'
import ClientQuickActions from '@/components/ClientQuickActions'

export const metadata: Metadata = { title: 'Clientes nuevos' }
export const dynamic = 'force-dynamic'

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} d`
}

function folderName(path: string | null): string {
  if (!path) return '—'
  return path.split('/').pop() ?? path
}

export default async function ClientesNuevosPage() {
  noStore()
  let clients: Client[] = []
  try {
    const { data } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('status', 'prospecto')
      .like('onedrive_folder_url', '/%')
      .order('created_at', { ascending: false })
    clients = (data ?? []) as Client[]
  } catch {
    clients = []
  }

  return (
    <div className="p-8">
      {/* Auto-refresh cada 5 segundos */}
      <AutoRefresh intervalMs={5000} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clientes nuevos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Detectados automáticamente desde carpeta local ·{' '}
            <span className="font-medium text-gray-700">{clients.length}</span>{' '}
            {clients.length === 1 ? 'pendiente' : 'pendientes'}
          </p>
        </div>

        {/* Indicador de monitoreo activo */}
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-700 font-medium">Monitor activo</span>
        </div>
      </div>

      {/* Instrucción */}
      <div className="bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg px-4 py-3 mb-6 flex items-start gap-3">
        <span className="text-lg mt-0.5">📁</span>
        <div>
          <p className="text-sm font-medium text-gray-700">Monitoreo automático de carpetas</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Cada vez que crees una carpeta nueva en la ruta configurada, aparecerá aquí en segundos.
            Podés iniciar la apertura, agregar notas o marcar el cliente como activo directamente.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Para activar el monitor en una terminal: <code className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono">npm run watch</code>
          </p>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-16 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm font-medium text-gray-700">No hay clientes nuevos pendientes</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando se detecte una nueva carpeta, aparecerá aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {client.first_name} {client.last_name}
                    </h3>
                    <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-amber-400" title="Prospecto" />
                    <span className="shrink-0 text-xs text-gray-400">{timeAgo(client.created_at)}</span>
                  </div>

                  {/* Carpeta detectada */}
                  <p className="text-xs text-gray-400 truncate mb-3">
                    📁 {folderName(client.onedrive_folder_url ?? null)}
                  </p>

                  {/* Nota automática si existe */}
                  {client.notes && client.notes !== `Detectado automáticamente desde carpeta local: ${client.onedrive_folder_url}` && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 mb-3 whitespace-pre-wrap max-h-20 overflow-y-auto">
                      {client.notes.replace(`Detectado automáticamente desde carpeta local: ${client.onedrive_folder_url}\n`, '').replace(`Detectado automáticamente desde carpeta local: ${client.onedrive_folder_url}`, '').trim() || client.notes}
                    </div>
                  )}

                  {/* Acciones rápidas */}
                  <ClientQuickActions client={client} />
                </div>

                {/* Número de cliente */}
                <div className="shrink-0 text-right">
                  <span className="font-mono text-xs text-gray-400">{client.client_number}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
