import type { Metadata } from 'next'
import { hasGoogleConnection, getGoogleEmail } from '@/lib/google/tokens'
import CalendarView from './CalendarView'

export const metadata: Metadata = { title: 'Agenda | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const [isGoogleConnected, googleEmail] = await Promise.all([
    hasGoogleConnection().catch(() => false),
    getGoogleEmail().catch(() => null),
  ])

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Agenda</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            {isGoogleConnected && googleEmail
              ? `Google Calendar · ${googleEmail}`
              : 'Eventos del CRM'}
          </p>
        </div>
      </div>

      <CalendarView isGoogleConnected={isGoogleConnected} />
    </div>
  )
}
