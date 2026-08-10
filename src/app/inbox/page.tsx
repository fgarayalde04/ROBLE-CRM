import { unstable_noStore as noStore } from 'next/cache'
import { getInboxTasks, getInboxOpenings, getInboxBcuStatuses, getInboxRecentClients } from '@/lib/db/inbox'
import { getEvents } from '@/lib/db/events'
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

type TodayEvent = {
  id: string
  title: string
  type: string
  event_date: string
  start_time: string | null
  end_time: string | null
  description: string | null
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

  const [tasksRaw, openingsRaw, bcuRaw, clientsRaw, todayEventsRaw] = await Promise.all([
    getInboxTasks(),
    getInboxOpenings(),
    getInboxBcuStatuses(),
    getInboxRecentClients(thirtyDaysAgoStr),
    getEvents({ from: todayStr, to: todayStr }),
  ])

  const tasks = tasksRaw ?? []
  const openings = openingsRaw ?? []
  const bcuRecords = bcuRaw ?? []
  const clients = clientsRaw ?? []
  const todayEvents: TodayEvent[] = (todayEventsRaw ?? []) as unknown as TodayEvent[]

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

  return <InboxClient initialData={data} todayEvents={todayEvents} />
}
