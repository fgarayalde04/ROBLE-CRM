import { NextResponse } from 'next/server'
import { getInboxTasks, getInboxOpenings, getInboxBcuStatuses, getInboxRecentClients } from '@/lib/db/inbox'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()

    const [tasksRaw, openingsRaw, bcuRaw, clientsRaw] = await Promise.all([
      getInboxTasks(),
      getInboxOpenings(),
      getInboxBcuStatuses(),
      getInboxRecentClients(thirtyDaysAgoStr),
    ])

    const tasks = tasksRaw ?? []
    const openings = openingsRaw ?? []
    const bcuRecords = bcuRaw ?? []
    const clients = clientsRaw ?? []

    // Summary calculations
    const overdue_tasks = tasks.filter(
      (t: any) => t.due_date && t.due_date < todayStr
    ).length

    const urgent_tasks = tasks.filter((t: any) => t.priority === 'urgente').length
    const open_tasks = tasks.length

    const bcu_incomplete = bcuRecords.filter((r: any) => r.status === 'incompleto').length

    // Stalled = trabado status OR no update in >7 days
    const stalled_openings = openings.filter(
      (o: any) =>
        o.status === 'trabado' ||
        (o.updated_at && o.updated_at < sevenDaysAgoStr)
    ).length

    const new_clients_30d = clients.length

    return NextResponse.json({
      tasks,
      openings,
      bcu_incomplete,
      clients_recent: clients,
      summary: {
        overdue_tasks,
        urgent_tasks,
        open_tasks,
        stalled_openings,
        new_clients_30d,
        bcu_incomplete,
      },
    })
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
