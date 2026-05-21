import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import InboxClient from './InboxClient'
import type { Metadata } from 'next'

type ClientPartial = {
  id: string
  client_number: string
  first_name: string
  last_name: string
  status: string
  advisor: string | null
  created_at: string
  updated_at: string
}

export const metadata: Metadata = { title: 'Inbox operativo' }
export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  noStore()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const [
    { data: tasksRaw },
    { data: openingsRaw },
    { data: bcuRaw },
    { data: clientsRaw },
  ] = await Promise.all([
    supabaseAdmin
      .from('tasks')
      .select('*, clients(first_name, last_name)')
      .neq('status', 'completado')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabaseAdmin
      .from('account_openings')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .not('status', 'in', '("cuenta_abierta","descartado")')
      .order('updated_at', { ascending: true }),
    supabaseAdmin
      .from('banco_central_records')
      .select('id, status'),
    supabaseAdmin
      .from('clients')
      .select('id, client_number, first_name, last_name, status, advisor, created_at, updated_at')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: false }),
  ])

  const tasks = tasksRaw ?? []
  const openings = openingsRaw ?? []
  const bcuRecords = bcuRaw ?? []
  const clients = clientsRaw ?? []

  const overdue_tasks = tasks.filter(
    (t) => t.due_date && t.due_date < todayStr
  ).length
  const urgent_tasks = tasks.filter((t) => t.priority === 'urgente').length
  const open_tasks = tasks.length
  const bcu_incomplete = bcuRecords.filter((r) => r.status === 'incompleto').length
  const stalled_openings = openings.filter(
    (o) =>
      o.status === 'trabado' ||
      (o.updated_at && o.updated_at < sevenDaysAgoStr)
  ).length

  const data = {
    tasks,
    openings,
    bcu_incomplete,
    clients_recent: clients as ClientPartial[],
    summary: {
      overdue_tasks,
      urgent_tasks,
      open_tasks,
      stalled_openings,
      new_clients_30d: clients.length,
      bcu_incomplete,
    },
  }

  return <InboxClient initialData={data} />
}
