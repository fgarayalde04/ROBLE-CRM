import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'

interface Alert {
  type: 'urgent' | 'overdue' | 'expiring'
  label: string
  count: number
  href: string
}

export default async function AlertsBanner() {
  const today = new Date().toISOString().split('T')[0]
  const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let alerts: Alert[] = []
  try {
    const [
      { count: urgentTasks },
      { count: overdueTasks },
      { count: expiringDocs },
      { count: overdueDeadlines },
    ] = await Promise.all([
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('priority', 'urgente')
        .in('status', ['pendiente', 'en_proceso', 'bloqueado']),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pendiente', 'en_proceso'])
        .lt('due_date', today),
      supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .not('expiry_date', 'is', null)
        .lte('expiry_date', in7days)
        .gte('expiry_date', today)
        .neq('status', 'completo'),
      supabase
        .from('deadlines')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendiente')
        .lt('due_date', today),
    ])

    if ((urgentTasks ?? 0) > 0)
      alerts.push({ type: 'urgent', label: `${urgentTasks} tarea${urgentTasks !== 1 ? 's' : ''} urgente${urgentTasks !== 1 ? 's' : ''}`, count: urgentTasks!, href: '/tasks?status=pendiente' })
    if ((overdueTasks ?? 0) > 0)
      alerts.push({ type: 'overdue', label: `${overdueTasks} tarea${overdueTasks !== 1 ? 's' : ''} vencida${overdueTasks !== 1 ? 's' : ''}`, count: overdueTasks!, href: '/tasks' })
    if ((expiringDocs ?? 0) > 0)
      alerts.push({ type: 'expiring', label: `${expiringDocs} documento${expiringDocs !== 1 ? 's' : ''} vence${expiringDocs !== 1 ? 'n' : ''} en 7 dias`, count: expiringDocs!, href: '/documents' })
    if ((overdueDeadlines ?? 0) > 0)
      alerts.push({ type: 'overdue', label: `${overdueDeadlines} vencimiento${overdueDeadlines !== 1 ? 's' : ''} sin completar`, count: overdueDeadlines!, href: '/calendar' })
  } catch {
    return null
  }

  if (alerts.length === 0) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-8 py-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-amber-800 mr-1">Alertas:</span>
        {alerts.map((a, i) => (
          <Link
            key={i}
            href={a.href}
            className="text-xs text-amber-800 underline-offset-2 hover:underline font-medium"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
