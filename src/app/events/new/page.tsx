import type { Metadata } from 'next'
import Link from 'next/link'
import EventForm from '@/components/EventForm'

export const metadata: Metadata = { title: 'Nuevo evento' }

export default function NewEventPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link href="/events" className="hover:text-gray-600">Calendario</Link>
        <span>/</span>
        <span className="text-gray-600">Nuevo evento</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo evento</h1>
      <EventForm mode="new" />
    </div>
  )
}
