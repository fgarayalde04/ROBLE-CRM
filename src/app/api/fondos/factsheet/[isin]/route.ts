import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken } from '@/lib/microsoft/graph'
import { getLatestFactsheetForIsin } from '@/lib/db/fondos'

export const dynamic = 'force-dynamic'

const DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''

export async function GET(req: NextRequest, { params }: { params: { isin: string } }) {
  const session = await getSession()
  if (!session) return new NextResponse('No autorizado', { status: 401 })

  const isin = params.isin.toUpperCase()

  const result = await getLatestFactsheetForIsin(isin)
  if (!result) return new NextResponse('Fondo o factsheet no encontrado', { status: 404 })
  const { factsheet, manager } = result

  if (!manager) return new NextResponse('Gestora no encontrada', { status: 404 })

  try {
    const token = await getGraphToken()
    const filePath = `Fondos/${manager.name}/${factsheet.file_name}`
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'follow',
      }
    )

    if (!res.ok) {
      return new NextResponse(`Error al obtener PDF: ${res.status}`, { status: 502 })
    }

    const pdfBytes = await res.arrayBuffer()

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${factsheet.file_name}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    console.error('Factsheet proxy error:', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
