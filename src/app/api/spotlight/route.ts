import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ clients: [], tasks: [], openings: [], resources: [], total: 0 })
  }

  const [clientsRes, tasksRes, openingsRes, resourcesRes] = await Promise.all([
    supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name, client_number, status')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,client_number.ilike.%${q}%`)
      .limit(5),

    supabaseAdmin
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .ilike('title', `%${q}%`)
      .neq('status', 'completado')
      .limit(4),

    supabaseAdmin
      .from('account_openings')
      .select('id, folder_name, status, advisor')
      .ilike('folder_name', `%${q}%`)
      .limit(3),

    supabaseAdmin
      .from('resources')
      .select('id, name, category, file_url')
      .ilike('name', `%${q}%`)
      .limit(3),
  ])

  const clients = clientsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const openings = openingsRes.data ?? []
  const resources = resourcesRes.data ?? []

  return NextResponse.json({
    clients,
    tasks,
    openings,
    resources,
    total: clients.length + tasks.length + openings.length + resources.length,
  })
}
