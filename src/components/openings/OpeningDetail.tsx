'use client'

import { useState } from 'react'
import type {
  AccountOpening,
  OpeningChecklistItem,
  OpeningNote,
  OpeningTask,
  OpeningDocument,
} from '@/types/platform'
import TabResumen from './TabResumen'
import TabChecklist from './TabChecklist'
import TabNotas from './TabNotas'
import TabTareas from './TabTareas'
import TabDocumentos from './TabDocumentos'
import TabTiempos from './TabTiempos'

type Tab = 'resumen' | 'checklist' | 'notas' | 'tareas' | 'documentos' | 'tiempos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'notas', label: 'Notas' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'tiempos', label: 'Tiempos' },
]

interface Props {
  opening: AccountOpening & { checklist_items: OpeningChecklistItem[] }
  notes: OpeningNote[]
  tasks: OpeningTask[]
  documents: OpeningDocument[]
}

export default function OpeningDetail({ opening, notes, tasks, documents }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

  const openNotesCount = notes.filter((n) => n.status === 'abierta').length
  const pendingTasksCount = tasks.filter((t) => t.status !== 'completada').length

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1" aria-label="Tabs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            let badge: number | null = null
            if (tab.id === 'notas' && openNotesCount > 0) badge = openNotesCount
            if (tab.id === 'tareas' && pendingTasksCount > 0) badge = pendingTasksCount

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-gray-900 border-b-2 border-[#2D3F52]'
                    : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
                {badge !== null && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-[#2D3F52] text-white">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'resumen' && (
          <TabResumen opening={opening} />
        )}
        {activeTab === 'checklist' && (
          <TabChecklist items={opening.checklist_items} openingId={opening.id} />
        )}
        {activeTab === 'notas' && (
          <TabNotas notes={notes} openingId={opening.id} />
        )}
        {activeTab === 'tareas' && (
          <TabTareas tasks={tasks} openingId={opening.id} />
        )}
        {activeTab === 'documentos' && (
          <TabDocumentos documents={documents} openingId={opening.id} />
        )}
        {activeTab === 'tiempos' && (
          <TabTiempos opening={opening} />
        )}
      </div>
    </div>
  )
}
