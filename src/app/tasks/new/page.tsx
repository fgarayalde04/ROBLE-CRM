import type { Metadata } from 'next'
import Link from 'next/link'
import TaskForm from '@/components/TaskForm'

export const metadata: Metadata = { title: 'Nueva tarea' }

export default function NewTaskPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/tasks" className="hover:text-gray-600">Pendientes</Link>
        <span>/</span>
        <span className="text-gray-600">Nueva tarea</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nueva tarea</h1>
      <TaskForm mode="new" />
    </div>
  )
}
