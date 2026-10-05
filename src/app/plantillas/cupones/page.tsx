import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasPermission } from '@/lib/auth'
import { getCouponCalendar, listCouponCalendars, type CouponCalendarRow } from '@/lib/db/couponCalendars'
import CuponesClient from './CuponesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendario de Cupones' }

// /plantillas/cupones        → subir un Incoming Cash y armar el calendario
// /plantillas/cupones?id=xxx → reabrir uno guardado
export default async function CalendarioCuponesPage({ searchParams }: { searchParams: { id?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.role, 'research', session.permissions)) redirect('/')

  let historial: CouponCalendarRow[] = []
  let guardado: Awaited<ReturnType<typeof getCouponCalendar>> = null
  try {
    ;[historial, guardado] = await Promise.all([
      listCouponCalendars({ limit: 100 }),
      searchParams.id ? getCouponCalendar(searchParams.id) : Promise.resolve(null),
    ])
  } catch (err) {
    console.error('[cupones] list', err)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <Link href="/plantillas" className="hover:text-gray-600">Plantillas</Link>
        <span>/</span>
        <span className="text-gray-600">Calendario de Cupones</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Calendario de Cupones</h1>
        <p className="mt-1 text-sm text-gray-500">
          Subí el reporte &quot;Incoming Cash&quot; (Projected Cash Flow) de una cuenta de Pershing y descargá el calendario en Excel o PDF.
        </p>
      </div>
      <CuponesClient
        usuario={session.name}
        guardado={guardado ? { id: guardado.id, clientId: guardado.client_id, calendar: guardado.datos } : null}
        historial={historial}
      />
    </div>
  )
}
