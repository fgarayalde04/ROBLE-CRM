import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { albojerFileName, generateAlbojerWorkbook } from '@/lib/albojer/excelGenerator'
import { positionsStore } from '@/lib/icheAcciones/db'

export const dynamic = 'force-dynamic'

// Se redibuja desde la base (fuente de verdad), igual que al generarlo.
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const store = positionsStore('albojer')
  const [open, closed, latest] = await Promise.all([store.getOpenPositions(), store.getClosedPositions(), store.getLatestGeneration()])
  const { buffer } = await generateAlbojerWorkbook(open, closed)
  const fileName = latest?.fileName ?? albojerFileName(new Date())

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}
