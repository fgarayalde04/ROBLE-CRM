import type { Metadata } from 'next'
import Image from 'next/image'
import { unstable_noStore as noStore } from 'next/cache'
import { isAprobacionToken } from '@/lib/aprobacion'
import { getSolicitudByAprobacionToken } from '@/lib/db/solicitudes'
import AprobarForm from './AprobarForm'

export const metadata: Metadata = { title: 'Confirmación de orden', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

interface Props {
  params: { token: string }
  searchParams: { r?: string }
}

// Página pública (sin login) a la que llega el cliente desde los botones del
// mail de la orden. Abrirla no registra nada: la respuesta se guarda recién
// cuando el cliente toca "Enviar respuesta".
export default async function AprobarPage({ params, searchParams }: Props) {
  noStore()
  const sol = isAprobacionToken(params.token) ? await getSolicitudByAprobacionToken(params.token) : null
  const initial = searchParams.r === 'si' ? 'aprobada' : searchParams.r === 'no' ? 'rechazada' : null
  const detalle: string | null = sol ? (sol.mail_cuerpo ?? sol.mail_preview ?? null) : null

  return (
    <main className="min-h-screen bg-[#F4F6F8] px-4 py-8 md:py-14">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Image src="/download.png" alt="Roble Capital" width={170} height={46} className="object-contain" priority />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-7">
          {!sol ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold text-[#2D3F52]">Link no válido</h1>
              <p className="mt-2 text-sm text-gray-500">No encontramos esta orden. Si recibiste este link por mail, contactá a tu asesor.</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-[#2D3F52]">Confirmación de orden</h1>
              <p className="mt-1 text-sm text-gray-500">
                {sol.client_name ?? 'Cliente'}{sol.solicitud_id ? ` · Orden ${sol.solicitud_id}` : ''}
              </p>

              {detalle && (
                <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-700">
                  {detalle}
                </div>
              )}

              <div className="mt-5">
                <AprobarForm
                  token={params.token}
                  initialDecision={initial}
                  respuestaPrevia={sol.aprobacion_cliente ?? null}
                  comentarioPrevio={sol.aprobacion_comentario ?? null}
                />
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Roble Capital · Mesa de Operaciones</p>
      </div>
    </main>
  )
}
