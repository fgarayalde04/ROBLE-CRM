import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPortfolioAccess } from '@/lib/auth'
import { resolveAccount } from '@/lib/db/portfolio'
import { imprimirEstadoCuenta } from '@/lib/estadoCuenta/imprimir'
import { partesPortafolio, type DatosPdfPortafolio } from '@/lib/portfolio/estadoCuenta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/portfolio/[accountNumber]/pdf — reporte de la cuenta para el
// cliente (formato estado de cuenta). Los datos los arma la pantalla con los
// mismos cálculos que muestra (datosPdf.ts); acá solo se imprimen.
export async function POST(req: NextRequest, { params }: { params: { accountNumber: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const account = await resolveAccount(decodeURIComponent(params.accountNumber))
  if (!hasPortfolioAccess(session, account)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const datos = (await req.json().catch(() => null))?.datos as DatosPdfPortafolio | undefined
  if (!datos?.fecha || !Array.isArray(datos.grupos)) return NextResponse.json({ error: 'Faltan los datos del reporte' }, { status: 400 })

  try {
    const pdf = await imprimirEstadoCuenta(partesPortafolio(datos))
    const nombre = `Portafolio${datos.cliente ? ` - ${datos.cliente}` : ''} ${datos.fecha}.pdf`.replace(/[^\w .,-]/g, '')
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` },
    })
  } catch (e: any) {
    console.error('[portfolio/pdf]', e)
    return NextResponse.json({ error: `No se pudo generar el PDF: ${e?.message ?? e}` }, { status: 500 })
  }
}
