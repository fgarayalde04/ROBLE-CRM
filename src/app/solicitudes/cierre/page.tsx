import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getCierreDia, hoyMontevideo, ESPERANDO_CLIENTE, type OrdenCierre } from '@/lib/db/cierreOrdenes'
import { MESA_ROLES } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cierre del día · Órdenes' }


const ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: 'Pendiente revisión', en_revision: 'En revisión', devuelta: 'Devuelta',
  mesa_operaciones: 'Trading Desk', mail_enviado: 'Esperando al cliente', aprobada_cliente: 'Aprobada por cliente',
  rechazada_cliente: 'Rechazada por cliente', en_ejecucion: 'En ejecución', ejecutada: 'Ejecutada', cancelada: 'Cancelada',
}
const OP_LABEL: Record<string, string> = { compra: 'Compra', venta: 'Venta', suscripcion: 'Compra', rescate: 'Venta' }

function fmtHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo' })
}
function fmtDia(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', timeZone: 'America/Montevideo' })
}
function importe(o: OrdenCierre) {
  if (o.monto) return `${o.moneda || 'USD'} ${Number(o.monto).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
  if (o.cantidad) return `${Number(o.cantidad).toLocaleString('es-UY')} u.`
  return '—'
}
function moverDia(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default async function CierreOrdenesPage({ searchParams }: { searchParams: { fecha?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const hoy = hoyMontevideo()
  const fecha = searchParams.fecha && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha) ? searchParams.fecha : hoy
  const todas = MESA_ROLES.includes(session.role)
  const c = await getCierreDia(fecha, todas ? null : { userId: session.id, userName: session.name })
  const esperando = c.pendientes.filter((p) => ESPERANDO_CLIENTE.includes(p.estado))

  const fechaLarga = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-UY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  // Resumen por asesor (solo para la vista de todas las órdenes)
  const porAsesor = new Map<string, { ingresadas: number; ejecutadas: number; rechazadas: number; canceladas: number; abiertas: number }>()
  if (todas) {
    const sumar = (l: OrdenCierre[], k: 'ingresadas' | 'ejecutadas' | 'rechazadas' | 'canceladas' | 'abiertas') => {
      for (const o of l) {
        const key = o.asesor || 'Sin asesor'
        const row = porAsesor.get(key) ?? { ingresadas: 0, ejecutadas: 0, rechazadas: 0, canceladas: 0, abiertas: 0 }
        row[k]++
        porAsesor.set(key, row)
      }
    }
    sumar(c.ingresadas, 'ingresadas'); sumar(c.ejecutadas, 'ejecutadas'); sumar(c.rechazadas, 'rechazadas')
    sumar(c.canceladas, 'canceladas'); sumar(c.pendientes, 'abiertas')
  }

  const kpis = [
    { label: 'Ingresadas', n: c.ingresadas.length, cls: 'text-gray-900' },
    { label: 'Ejecutadas', n: c.ejecutadas.length, cls: 'text-emerald-600' },
    { label: 'Rechazadas', n: c.rechazadas.length, cls: 'text-red-600' },
    { label: 'Canceladas', n: c.canceladas.length, cls: 'text-gray-500' },
    { label: 'Abiertas', n: c.pendientes.length, cls: 'text-amber-600', sub: esperando.length ? `${esperando.length} esperando al cliente` : null },
  ]

  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <Link href="/solicitudes" className="hover:text-gray-600">Órdenes</Link>
        <span>/</span>
        <span className="text-gray-600">Cierre del día</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Cierre del día</h1>
          <p className="text-sm text-gray-500 mt-0.5 first-letter:uppercase">
            {fechaLarga} · {todas ? 'todas las órdenes' : 'tus órdenes'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/solicitudes/cierre?fecha=${moverDia(fecha, -1)}`} className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded hover:bg-gray-50">←</Link>
          <form action="/solicitudes/cierre" className="flex items-center gap-2">
            <input type="date" name="fecha" defaultValue={fecha} max={hoy} className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
            <button className="px-3 py-1.5 text-sm bg-[#2D3F52] text-white rounded hover:bg-[#354A5E]">Ver</button>
          </form>
          {fecha < hoy && (
            <Link href={`/solicitudes/cierre?fecha=${moverDia(fecha, 1)}`} className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded hover:bg-gray-50">→</Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-400">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.n}</p>
            {k.sub && <p className="text-xs text-gray-500 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {todas && porAsesor.size > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 mb-4">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Por asesor</h2>
          </div>
          <div className="mobile-scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="px-5 py-2 font-medium">Asesor</th>
                  <th className="px-3 py-2 font-medium text-right">Ingresadas</th>
                  <th className="px-3 py-2 font-medium text-right">Ejecutadas</th>
                  <th className="px-3 py-2 font-medium text-right">Rechazadas</th>
                  <th className="px-3 py-2 font-medium text-right">Canceladas</th>
                  <th className="px-5 py-2 font-medium text-right">Abiertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Array.from(porAsesor.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([asesor, r]) => (
                  <tr key={asesor}>
                    <td className="px-5 py-2 text-gray-900">{asesor}</td>
                    <td className="px-3 py-2 text-right">{r.ingresadas || '—'}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{r.ejecutadas || '—'}</td>
                    <td className="px-3 py-2 text-right text-red-600">{r.rechazadas || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.canceladas || '—'}</td>
                    <td className="px-5 py-2 text-right text-amber-700">{r.abiertas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Lista titulo="Ejecutadas" dot="bg-emerald-500" ordenes={c.ejecutadas} hora="ejecutado_at" verAsesor={todas} />
        <Lista titulo="Rechazadas por el cliente" dot="bg-red-500" ordenes={c.rechazadas} hora="aprobacion_at" verAsesor={todas} />
        <Lista titulo="Canceladas" dot="bg-gray-400" ordenes={c.canceladas} hora="cancelado_at" verAsesor={todas} />
        <Lista titulo="Quedan abiertas" dot="bg-amber-500" ordenes={c.pendientes} hora="created_at" verAsesor={todas} conDia />
        <Lista titulo="Ingresadas en el día" dot="bg-blue-500" ordenes={c.ingresadas} hora="created_at" verAsesor={todas} />
      </div>
    </div>
  )
}

function Lista({
  titulo, dot, ordenes, hora, verAsesor, conDia = false,
}: {
  titulo: string
  dot: string
  ordenes: OrdenCierre[]
  hora: 'created_at' | 'ejecutado_at' | 'cancelado_at' | 'aprobacion_at'
  verAsesor: boolean
  conDia?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        <span className="text-xs text-gray-400">· {ordenes.length}</span>
      </div>
      {ordenes.length === 0 ? (
        <p className="px-5 py-3 text-sm text-gray-400">Ninguna.</p>
      ) : (
        <div className="mobile-scroll-x">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {ordenes.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                    {conDia ? `${fmtDia(o[hora] ?? o.created_at)} ` : ''}{fmtHora(o[hora])}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/solicitudes?open=${o.id}`} className="font-medium text-gray-900 hover:underline">
                      {o.client_name || 'Cliente'}
                    </Link>
                    <p className="text-xs text-gray-400">{o.solicitud_id}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {OP_LABEL[o.tipo_operacion ?? ''] ?? o.tipo_operacion ?? '—'}
                    {o.instrumento_nombre ? <span className="text-gray-500"> · {o.instrumento_nombre}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-900 whitespace-nowrap">{importe(o)}</td>
                  {verAsesor && <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{o.asesor ?? '—'}</td>}
                  <td className="px-5 py-2.5 text-xs text-gray-600 whitespace-nowrap">{ESTADO_LABEL[o.estado] ?? o.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
