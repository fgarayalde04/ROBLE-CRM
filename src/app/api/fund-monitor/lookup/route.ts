import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getFundReturnsByIsin } from '@/lib/db/fundMonitor'
import { lookupDavinciLive } from '@/lib/fundMonitor/liveLookup'

export const maxDuration = 120 // la búsqueda en vivo abre un browser headless y puede esperar en cola

const toNum = (v: unknown) => (v != null ? Number(v) : null)

// Usado por Propuestas (selección de fondo / edición de ISIN) para autocompletar
// los rendimientos. Primero el Monitor de Fondos (ya sincronizado con Davinci);
// si el fondo no está ahí, o no tiene datos, se consulta Davinci en vivo — los
// rendimientos se traen siempre que Davinci tenga el fondo, esté o no en el
// Monitor.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const isin = params.get('isin')?.trim()
  const nombre = params.get('nombre')?.trim() || undefined
  if (!isin) {
    return NextResponse.json({ error: 'Falta el parámetro isin' }, { status: 400 })
  }

  const row = await getFundReturnsByIsin(isin)
  const hasData = row && [row.r_ytd, row.r_1y, row.r_3y, row.r_5y, row.y_2025, row.y_2024, row.y_2023, row.y_2022, row.y_2021].some(v => v != null)
  if (row && hasData) {
    return NextResponse.json({
      found: true,
      source: 'monitor',
      nombre: row.nombre,
      returns: {
        return_ytd: toNum(row.r_ytd), return_1y: toNum(row.r_1y), return_3y: toNum(row.r_3y), return_5y: toNum(row.r_5y),
        return_2025: toNum(row.y_2025), return_2024: toNum(row.y_2024), return_2023: toNum(row.y_2023),
        return_2022: toNum(row.y_2022), return_2021: toNum(row.y_2021),
      },
    })
  }

  const live = await lookupDavinciLive(isin, nombre ?? row?.nombre)
  if (live.status === 'ok') {
    const d = live.data
    return NextResponse.json({
      found: true,
      source: 'davinci_live',
      nombre: d.nombreDavinci,
      returns: {
        return_ytd: d.ytd, return_1y: d.r1a, return_3y: d.r3a, return_5y: d.r5a,
        return_2025: d.y2025, return_2024: d.y2024, return_2023: d.y2023, return_2022: d.y2022, return_2021: d.y2021,
      },
    })
  }
  return NextResponse.json({ found: false, davinci: live.status })
}
