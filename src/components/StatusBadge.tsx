'use client'

import { clsx } from 'clsx'
import type {
  ClientStatus,
  DocumentStatus,
  TaskStatus,
  TaskPriority,
} from '@/types/platform'

const clientStatusConfig: Record<ClientStatus, { label: string; className: string }> = {
  prospecto:               { label: 'Prospecto',              className: 'bg-slate-100 text-slate-700 border-slate-200' },
  activo:                  { label: 'Activo',                 className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  en_apertura:             { label: 'En apertura',            className: 'bg-blue-50 text-blue-700 border-blue-200' },
  cerrado:                 { label: 'Cerrado',                className: 'bg-gray-100 text-gray-500 border-gray-200' },
  inactivo:                { label: 'Inactivo',               className: 'bg-gray-100 text-gray-500 border-gray-200' },
  descartado:              { label: 'Descartado',             className: 'bg-red-50 text-red-500 border-red-200' },
  pendiente_documentacion: { label: 'Pend. documentacion',    className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_revision:             { label: 'En revision',            className: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const documentStatusConfig: Record<DocumentStatus, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completo:  { label: 'Completo',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  vencido:   { label: 'Vencido',   className: 'bg-red-50 text-red-700 border-red-200' },
  revisar:   { label: 'Revisar',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  enviado:   { label: 'Enviado',   className: 'bg-purple-50 text-purple-700 border-purple-200' },
  firmado:   { label: 'Firmado',   className: 'bg-teal-50 text-teal-700 border-teal-200' },
}

const taskStatusConfig: Record<TaskStatus, { label: string; className: string }> = {
  pendiente:   { label: 'Pendiente',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_proceso:  { label: 'En proceso',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
  bloqueado:   { label: 'Bloqueado',   className: 'bg-red-50 text-red-700 border-red-200' },
  completado:  { label: 'Completado',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  baja:    { label: 'Baja',    className: 'bg-slate-50 text-slate-600 border-slate-200' },
  media:   { label: 'Media',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  alta:    { label: 'Alta',    className: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgente: { label: 'Urgente', className: 'bg-red-50 text-red-700 border-red-200' },
}

interface Props {
  type: 'client_status' | 'document_status' | 'task_status' | 'priority'
  value: string
}

export default function StatusBadge({ type, value }: Props) {
  let config: { label: string; className: string } | undefined

  if (type === 'client_status') config = clientStatusConfig[value as ClientStatus]
  else if (type === 'document_status') config = documentStatusConfig[value as DocumentStatus]
  else if (type === 'task_status') config = taskStatusConfig[value as TaskStatus]
  else if (type === 'priority') config = priorityConfig[value as TaskPriority]

  if (!config) return <span className="text-gray-400 text-xs">{value}</span>

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
