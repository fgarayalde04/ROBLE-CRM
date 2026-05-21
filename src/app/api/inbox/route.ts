import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    // Summary calculations
    const overdue_tasks = tasks.filter(
      (t) => t.due_date && t.due_date < todayStr
    ).length

    const urgent_tasks = tasks.filter((t) => t.priority === 'urgente').length
    const open_tasks = tasks.length

    const bcu_incomplete = bcuRecords.filter((r) => r.status === 'incompleto').length

    // Stalled = trabado status OR no update in >7 days
    const stalled_openings = openings.filter(
      (o) =>
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
