import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getClosedPositions, getLatestGeneration, getOpenPositions } from '@/lib/icheAcciones/db'
import { generateWorkbook } from '@/lib/icheAcciones/excelGenerator'
import { monthNameEs } from '@/lib/icheAcciones/monthNameEs'

export const dynamic = 'force-dynamic'

// El .xlsx no se guarda: se redibuja desde la base (fuente de verdad), igual
// que al generarlo, así se puede volver a descargar sin repetir la carga.
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const [open, closed, latest] = await Promise.all([getOpenPositions(), getClosedPositions(), getLatestGeneration()])
  const { buffer } = await generateWorkbook(open, closed)
  const fileName = latest?.fileName ?? `Iche Acciones ${monthNameEs(new Date())}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}
