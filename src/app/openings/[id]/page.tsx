import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import OpeningDetail from '@/components/openings/OpeningDetail'
import type { AccountOpening, OpeningChecklistItem, OpeningNote, OpeningTask, OpeningDocument } from '@/types/platform'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data } = await supabaseAdmin
    .from('account_openings')
    .select('folder_name')
    .eq('id', params.id)
    .single()
  return { title: data?.folder_name ?? 'Apertura' }
}

export default async function OpeningDetailPage({ params }: { params: { id: string } }) {
  noStore()
  const [openingRes, notesRes, tasksRes, docsRes] = await Promise.all([
    supabaseAdmin
      .from('account_openings')
      .select(`
        *,
        client:clients(id, first_name, last_name, client_number),
        checklist_items:opening_checklist_items(*)
      `)
      .eq('id', params.id)
      .single(),
    supabaseAdmin
      .from('opening_notes')
      .select('*')
      .eq('opening_id', params.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('opening_tasks')
      .select('*')
      .eq('opening_id', params.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('opening_documents')
      .select('*')
      .eq('opening_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (openingRes.error || !openingRes.data) {
    notFound()
  }

  const opening = openingRes.data as AccountOpening & { checklist_items: OpeningChecklistItem[] }
  const notes = (notesRes.data ?? []) as OpeningNote[]
  const tasks = (tasksRes.data ?? []) as OpeningTask[]
  const documents = (docsRes.data ?? []) as OpeningDocument[]

  // Sort checklist by sort_order
  if (opening.checklist_items) {
    opening.checklist_items.sort((a, b) => a.sort_order - b.sort_order)
  }

  const openNotesCount = notes.filter((n) => n.status === 'abierta').length
  const pendingTasksCount = tasks.filter((t) => t.status !== 'completada').length

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/openings" className="hover:text-gray-600 transition-colors">
          Apertura de cuentas
        </Link>
        <span>/</span>
        <span className="text-gray-600">{opening.folder_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{opening.folder_name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {opening.client && (
              <Link href={`/clients/${opening.client.id}`} className="text-xs text-blue-600 hover:underline">
                {opening.client.first_name} {opening.client.last_name}
              </Link>
            )}
            {opening.advisor && (
              <span className="text-xs text-gray-400">{opening.advisor}</span>
            )}
            {openNotesCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                {openNotesCount} nota{openNotesCount !== 1 ? 's' : ''} abierta{openNotesCount !== 1 ? 's' : ''}
              </span>
            )}
            {pendingTasksCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                {pendingTasksCount} tarea{pendingTasksCount !== 1 ? 's' : ''} pendiente{pendingTasksCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/openings"
          className="px-3 py-2 text-sm border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
        >
          Volver
        </Link>
      </div>

      {/* Detail tabs */}
      <OpeningDetail
        opening={opening}
        notes={notes}
        tasks={tasks}
        documents={documents}
      />
    </div>
  )
}
