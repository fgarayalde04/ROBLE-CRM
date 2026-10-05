import Link from 'next/link'
import type { CouponCalendarRow } from '@/lib/db/couponCalendars'

// Ficha del cliente: calendarios de cupones generados en Plantillas → Calendario de Cupones.

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const usd = (n: number) => `USD ${Number(n).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ClientCouponCalendarsCard({ calendarios }: { calendarios: CouponCalendarRow[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Calendarios de cupones</h2>
        <Link href="/plantillas/cupones" className="text-xs text-blue-600 hover:underline">Nuevo</Link>
      </div>
      {calendarios.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">Sin calendarios generados.</p>
      ) : (
        <div className="mobile-scroll-x">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {calendarios.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-900">{fmtDate(c.doc_date)} · cuenta {c.account_number}</p>
                    <p className="text-xs text-gray-400">
                      {c.bonds_count} bonos · nominal {usd(c.nominal_total)} · por {c.created_by ?? '—'} el {fmtDate(c.created_at.slice(0, 10))}
                    </p>
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <p className="text-sm font-medium text-gray-900">{usd(c.annual_income)}</p>
                    <p className="text-xs text-gray-400">renta anual</p>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link href={`/plantillas/cupones?id=${c.id}`} className="text-xs text-blue-600 hover:underline">Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
