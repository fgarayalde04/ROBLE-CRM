import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getFundReturnsByIsin } from '@/lib/db/fundMonitor'

// Usado por Propuestas (selección de fondo / edición de ISIN) para
// autocompletar los rendimientos desde el Monitor de Fondos en vez de
// tipearlos o extraerlos de un factsheet a mano.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const isin = new URL(req.url).searchParams.get('isin')?.trim()
  if (!isin) {
    return NextResponse.json({ error: 'Falta el parámetro isin' }, { status: 400 })
  }

  const row = await getFundReturnsByIsin(isin)
  if (!row) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    returns: {
      return_ytd: row.r_ytd != null ? Number(row.r_ytd) : null,
      return_1y: row.r_1y != null ? Number(row.r_1y) : null,
      return_3y: row.r_3y != null ? Number(row.r_3y) : null,
      return_5y: row.r_5y != null ? Number(row.r_5y) : null,
    },
  })
}
