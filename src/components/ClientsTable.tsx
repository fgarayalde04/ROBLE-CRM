'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Client } from '@/types/platform'
import ClientSidePanel from './ClientSidePanel'
import OneDriveFolderButton from './OneDriveFolderButton'
import ClientStatusToggle from './ClientStatusToggle'
import DeleteClientButton from './DeleteClientButton'

type SortKey = 'nombre' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

interface Props {
  clients: Client[]
  taskCounts: Record<string, number>
  isCerradosTab: boolean
  isPendientesTab?: boolean
  activeSort: SortKey
  activeDir: SortDir
  sortHrefs: Record<SortKey, string>
}

export default function ClientsTable({
  clients,
  taskCounts,
  isCerradosTab,
  isPendientesTab = false,
  activeSort,
  activeDir,
  sortHrefs,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelClient, setPanelClient] = useState<any>(null)
  const [panelLoading, setPanelLoading] = useState(false)

  const openPanel = useCallback(async (id: string) => {
    setSelectedId(id)
    setPanelClient(null)
    setPanelLoading(true)
    try {
      const res = await fetch(`/api/clients/by-id?id=${id}`)
      const data = await res.json()
      setPanelClient(data)
    } catch {
      setPanelClient(null)
    } finally {
      setPanelLoading(false)
    }
  }, [])

  const closePanel = useCallback(() => {
    setSelectedId(null)
    setPanelClient(null)
    setPanelLoading(false)
  }, [])

  function SortIcon({ col }: { col: SortKey }) {
    const active = activeSort === col
    return (
      <svg className={`ml-1 w-3 h-3 ${active ? 'text-[#2D3F52]' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {!active && <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />}
        {active && activeDir === 'asc'  && <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />}
        {active && activeDir === 'desc' && <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
      </svg>
    )
  }

  return (
    <>
      {/* ─── Mobile cards ─── */}
      <div className="md:hidden space-y-2">
        {clients.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">
              {isCerradosTab ? 'No hay clientes cerrados.' : isPendientesTab ? 'No hay cuentas pendientes.' : 'No se encontraron clientes.'}
            </p>
          </div>
        ) : clients.map((c) => {
          const openTasks = taskCounts[c.id] ?? 0
          const isClosed = c.status === 'inactivo'
          return (
            <div
              key={c.id}
              className={`bg-white border border-gray-200 rounded-xl px-4 py-3 ${isClosed ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  onClick={() => openPanel(c.id)}
                  className={`font-semibold text-[15px] leading-tight text-left ${isClosed ? 'text-gray-400 line-through' : 'text-[#2D3F52]'}`}
                >
                  {c.first_name} {c.last_name}
                </button>
                {openTasks > 0 && (
                  <span className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    {openTasks} tarea{openTasks !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2 mb-3">
                {c.advisor && (
                  <span className="text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/6 px-2 py-0.5 rounded">
                    {c.advisor}
                  </span>
                )}
                {c.status === 'pendiente' ? (
                  <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    En apertura
                  </span>
                ) : (
                  <ClientStatusToggle
                    clientId={c.id}
                    clientName={`${c.first_name} ${c.last_name}`}
                    isClosed={isClosed}
                    closedAt={c.closed_at}
                    closedBy={c.closed_by}
                    closeReason={c.close_reason}
                  />
                )}
                {c.created_at && (
                  <span className="text-[11px] text-gray-400">
                    Alta {format(new Date(c.created_at), "d MMM yyyy", { locale: es })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => openPanel(c.id)}
                  className="flex-1 text-center text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/5 border border-[#2D3F52]/15 px-3 py-1.5 rounded-lg hover:bg-[#2D3F52]/10 transition-colors"
                >
                  Ver ficha
                </button>
                {(c.drive_id || c.item_id || c.web_url || c.onedrive_folder_url) && (
                  <div className="flex-1">
                    <OneDriveFolderButton
                      driveId={c.drive_id}
                      itemId={c.item_id}
                      webUrl={c.web_url ?? c.onedrive_folder_url}
                      label="Carpeta"
                    />
                  </div>
                )}
                {c.phone && (
                  <a
                    href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WA
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Desktop table ─── */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-400">
              {isCerradosTab ? 'No hay clientes cerrados.' : isPendientesTab ? 'No hay cuentas pendientes.' : 'No se encontraron clientes.'}
            </p>
          </div>
        ) : isCerradosTab ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHrefs['nombre']} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Nombre<SortIcon col="nombre" />
                  </Link>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fecha cierre</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cerrado por</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHrefs['created_at']} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Fecha de alta<SortIcon col="created_at" />
                  </Link>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-gray-50/60 transition-colors bg-gray-50/30 cursor-pointer ${selectedId === c.id ? 'bg-blue-50/40' : ''}`}
                  onClick={() => openPanel(c.id)}
                >
                  <td className="px-5 py-3">
                    <span className="font-medium text-gray-500 hover:text-[#2D3F52] line-through decoration-gray-300">
                      {c.first_name} {c.last_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.advisor
                      ? <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{c.advisor}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.closed_at
                      ? format(new Date(c.closed_at), "d MMM yyyy", { locale: es })
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.closed_by ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">{c.close_reason ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {c.created_at ? format(new Date(c.created_at), "d MMM yyyy", { locale: es }) : '—'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <ClientStatusToggle
                        clientId={c.id}
                        clientName={`${c.first_name} ${c.last_name}`}
                        isClosed={true}
                        closedAt={c.closed_at}
                        closedBy={c.closed_by}
                        closeReason={c.close_reason}
                      />
                      <DeleteClientButton clientId={c.id} clientName={`${c.first_name} ${c.last_name}`} compact />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHrefs['nombre']} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Nombre<SortIcon col="nombre" />
                  </Link>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Asesor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tareas</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <Link href={sortHrefs['created_at']} className="inline-flex items-center hover:text-[#2D3F52] transition-colors">
                    Fecha de alta<SortIcon col="created_at" />
                  </Link>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Carpeta</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((c) => {
                const openTasks = taskCounts[c.id] ?? 0
                const isClosed = c.status === 'inactivo'
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-50/60 transition-colors cursor-pointer ${isClosed ? 'opacity-60' : ''} ${selectedId === c.id ? 'bg-blue-50/40' : ''}`}
                    onClick={() => openPanel(c.id)}
                  >
                    <td className="px-5 py-3">
                      <span className={`font-medium ${isClosed ? 'text-gray-400 line-through decoration-gray-300' : 'text-[#2D3F52]'}`}>
                        {c.first_name} {c.last_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.advisor
                        ? <span className="text-xs font-medium text-[#2D3F52] bg-[#2D3F52]/5 px-2 py-0.5 rounded">{c.advisor}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {c.status === 'pendiente' ? (
                        <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          En apertura
                        </span>
                      ) : (
                        <ClientStatusToggle
                          clientId={c.id}
                          clientName={`${c.first_name} ${c.last_name}`}
                          isClosed={isClosed}
                          closedAt={c.closed_at}
                          closedBy={c.closed_by}
                          closeReason={c.close_reason}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {openTasks > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          <span>{openTasks}</span>
                          <span className="text-amber-500">tarea{openTasks !== 1 ? 's' : ''}</span>
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {c.created_at ? format(new Date(c.created_at), "d MMM yyyy", { locale: es }) : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <OneDriveFolderButton
                        driveId={c.drive_id}
                        itemId={c.item_id}
                        webUrl={c.web_url ?? c.onedrive_folder_url}
                        label="Abrir carpeta"
                      />
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <DeleteClientButton
                        clientId={c.id}
                        clientName={`${c.first_name} ${c.last_name}`}
                        compact
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Side panel */}
      <ClientSidePanel
        client={panelClient}
        loading={panelLoading}
        onClose={closePanel}
      />
    </>
  )
}
