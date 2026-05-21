'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Task, Client } from '@/types/platform'

type TaskWithClient = Task & {
  client: Pick<Client, 'id' | 'first_name' | 'last_name' | 'client_number'> | null
}

const priorityColor: Record<string, string> = {
  urgente: 'bg-red-100 text-red-700 border-red-200',
  alta: 'bg-orange-50 text-orange-700 border-orange-200',
  media: 'bg-amber-50 text-amber-700 border-amber-200',
  baja: 'bg-gray-100 text-gray-500 border-gray-200',
}

interface Props {
  tasks: TaskWithClient[]
}

export default function TodayTasksPanel({ tasks: initial }: Props) {
  const [tasks, setTasks] = useState(initial)
  const [completing, setCompleting] = useState<string | null>(null)

  async function complete(task: TaskWithClient) {
    setCompleting(task.id)
    const res = await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: task.id,
        status: 'completado',
        completed_at: new Date().toISOString(),
      }),
    })
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    }
    setCompleting(null)
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400 py-2">Sin pendientes para hoy.</p>
  }

  return (
    <ul className="space-y-1">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[#EEF0F4] bg-white hover:bg-[#F4F6F8] transition-colors"
        >
          <button
            onClick={() => complete(task)}
            disabled={completing === task.id}
            className="w-4 h-4 rounded border-2 border-gray-300 hover:border-[#16A34A] shrink-0 transition-colors flex items-center justify-center"
          />
          <div className="flex-1 min-w-0">
            <Link
              href={`/tasks/${task.id}`}
              className="text-sm text-gray-800 hover:text-[#2D3F52] hover:underline truncate block"
            >
              {task.title}
            </Link>
            {task.client && (
              <span className="text-xs text-gray-400">
                {task.client.first_name} {task.client.last_name}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded border shrink-0 ${priorityColor[task.priority] ?? ''}`}
          >
            {task.priority}
          </span>
        </li>
      ))}
    </ul>
  )
}
