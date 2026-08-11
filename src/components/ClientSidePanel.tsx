'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Client } from '@/types/platform'
import OneDriveFolderButton from './OneDriveFolderButton'

interface BcFichaPersona {
  nombres?: string
  apellidos?: string
  fecha_nacimiento?: string
  numero_documento?: string
  domicilio?: string
  ciudad_cp?: string
  pais?: string
  telefono?: string
  celular?: string
  email?: string
  profesion?: string
  institucion?: string
}

interface ClientWithBC extends Client {
  banco_central: { id: string; type: string; customer_number: string | null; authorized_email: string | null }[]
  bc_ficha: { ficha_data: { personas?: BcFichaPersona[]; codigo_cliente?: string } | null; tipo_cliente: string } | null
}

interface Props {
  client: ClientWithBC | null
  loading: boolean
  onClose: () => void
}

const clientTypeLabel: Record<string, string> = {
  local: 'Roble Local',
  internacional: 'Roble Internacional',
}

const statusLabel: Record<string, string> = {
  activo: 'Activo',
  prospecto: 'Prospecto',
  en_apertura: 'En apertura',
  pendiente_documentacion: 'Pendiente documentación',
  en_revision: 'En revisión',
  inactivo: 'Inactivo',
  cerrado: 'Cerrado',
  descartado: 'Descartado',
}

const statusColor: Record<string, string> = {
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  prospecto: 'bg-blue-50 text-blue-700 border-blue-200',
  en_apertura: 'bg-amber-50 text-amber-700 border-amber-200',
  pendiente_documentacion: 'bg-orange-50 text-orange-700 border-orange-200',
  en_revision: 'bg-purple-50 text-purple-700 border-purple-200',
  inactivo: 'bg-gray-50 text-gray-500 border-gray-200',
  cerrado: 'bg-red-50 text-red-700 border-red-200',
  descartado: 'bg-red-50 text-red-500 border-red-100',
}

export default function ClientSidePanel({ client, loading, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const open = loading || client !== null

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const hasFolder = client && (client.drive_id || client.item_id || client.web_url || client.onedrive_folder_url)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ borderLeft: '1px solid #E2E8F0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#2D3F52]/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-[#2D3F52]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ficha de cliente</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {loading && !client && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[#2D3F52]/20 border-t-[#2D3F52] rounded-full animate-spin" />
              <p className="text-xs text-gray-400">Cargando ficha...</p>
            </div>
          </div>
        )}

        {/* Content */}
        {client && (
          <div className="flex-1 overflow-y-auto">
            {/* Name + status */}
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-[#2D3F52] leading-tight">
                    {client.first_name} {client.last_name}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">#{client.client_number}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusColor[client.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {statusLabel[client.status] ?? client.status}
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Acciones rápidas</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/clients/${client.id}/edit`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2D3F52] bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  Editar
                </Link>
                {(client.email || client.bc_ficha?.ficha_data?.personas?.[0]?.email || client.banco_central[0]?.authorized_email) && (
                  <CopyButton text={(client.email || client.bc_ficha?.ficha_data?.personas?.[0]?.email || client.banco_central[0]?.authorized_email)!} label="Copiar email" />
                )}
                {(client.phone || client.bc_ficha?.ficha_data?.personas?.[0]?.celular || client.bc_ficha?.ficha_data?.personas?.[0]?.telefono) && (
                  <CopyButton text={(client.phone || client.bc_ficha?.ficha_data?.personas?.[0]?.celular || client.bc_ficha?.ficha_data?.personas?.[0]?.telefono)!} label="Copiar celular" />
                )}
                {hasFolder && (
                  <OneDriveFolderButton
                    driveId={client.drive_id}
                    itemId={client.item_id}
                    webUrl={client.web_url ?? client.onedrive_folder_url}
                    label="OneDrive"
                  />
                )}
                <Link
                  href={`/ordenes`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  Enviar orden
                </Link>
                <Link
                  href={`/tasks/new?clientId=${client.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Crear tarea
                </Link>
                {client.banco_central.length > 0 && (
                  <Link
                    href={`/banco-central?q=${encodeURIComponent(client.client_number)}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
                    Banco Central
                  </Link>
                )}
                <Link
                  href={`/clients/${client.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Ver ficha completa →
                </Link>
              </div>
            </div>

            {/* Data sections */}
            <div className="px-5 py-4 space-y-5">
              {(() => {
                const titular: BcFichaPersona = client.bc_ficha?.ficha_data?.personas?.[0] ?? {}
                const bcRecord = client.banco_central[0]
                const email = client.email || titular.email || bcRecord?.authorized_email || null
                const phone = client.phone || titular.celular || titular.telefono || null
                const direccion = client.address || [titular.domicilio, titular.ciudad_cp, titular.pais].filter(Boolean).join(', ') || null
                const cedula = client.document_number
                  ? [client.document_type, client.document_number].filter(Boolean).join(' ')
                  : titular.numero_documento || null
                const fechaNac = client.birth_date
                  ? format(new Date(client.birth_date), 'd MMM yyyy', { locale: es })
                  : titular.fecha_nacimiento || null
                const empresa = titular.institucion || titular.profesion || null
                const nroCliente = client.client_number || client.bc_ficha?.ficha_data?.codigo_cliente || bcRecord?.customer_number || null
                return (
                  <>
                    {/* Contacto */}
                    <section>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contacto</h3>
                      <div className="space-y-2.5">
                        <Row label="Email">
                          {email
                            ? <a href={`mailto:${email}`} className="text-sm text-[#2D3F52] hover:underline break-all">{email}</a>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="Celular">
                          {phone
                            ? <span className="text-sm text-gray-800">{phone}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="Dirección">
                          {direccion
                            ? <span className="text-sm text-gray-800">{direccion}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                      </div>
                    </section>

                    {/* Identificación */}
                    <section>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Identificación</h3>
                      <div className="space-y-2.5">
                        <Row label="N° de cliente">
                          {nroCliente
                            ? <span className="text-sm font-mono text-gray-800">{nroCliente}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="N° de cuenta">
                          {nroCliente
                            ? <span className="text-sm font-mono text-gray-800">{nroCliente}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="Cédula / Doc.">
                          {cedula
                            ? <span className="text-sm text-gray-800">{cedula}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="Fecha de nacimiento">
                          {fechaNac
                            ? <span className="text-sm text-gray-800">{fechaNac}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                        <Row label="Empresa">
                          {empresa
                            ? <span className="text-sm text-gray-800">{empresa}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </Row>
                      </div>
                    </section>
                  </>
                )
              })()}

              {/* Perfil */}
              <section>
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Perfil</h3>
                <div className="space-y-2.5">
                  <Row label="Tipo de cliente">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                      client.client_type === 'local'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}>
                      {clientTypeLabel[client.client_type] ?? client.client_type}
                    </span>
                  </Row>
                  <Row label="Asesor">
                    {client.advisor
                      ? <span className="text-sm text-gray-800">{client.advisor}</span>
                      : <span className="text-sm text-gray-300">—</span>}
                  </Row>
                  <Row label="Fecha de alta">
                    <span className="text-sm text-gray-800">
                      {format(new Date(client.created_at), "d 'de' MMMM yyyy", { locale: es })}
                    </span>
                  </Row>
                  <Row label="Estado doc.">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusColor[client.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {statusLabel[client.status] ?? client.status}
                    </span>
                  </Row>
                  {client.banco_central.length > 0 && (
                    <Row label="Banco Central">
                      <div className="flex gap-1 flex-wrap">
                        {client.banco_central.map((bc) => (
                          <span key={bc.id} className="text-xs font-medium px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">
                            {bc.type === 'local' ? 'Local' : 'Internacional'}
                          </span>
                        ))}
                      </div>
                    </Row>
                  )}
                </div>
              </section>

              {/* OneDrive */}
              {hasFolder && (
                <section>
                  <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Carpeta OneDrive</h3>
                  <OneDriveFolderButton
                    driveId={client.drive_id}
                    itemId={client.item_id}
                    webUrl={client.web_url ?? client.onedrive_folder_url}
                    label="Abrir carpeta del cliente"
                    variant="badge"
                  />
                </section>
              )}

              {/* Comentarios */}
              {client.notes && (
                <section>
                  <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Comentarios</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {})
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.637c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
      {label}
    </button>
  )
}
