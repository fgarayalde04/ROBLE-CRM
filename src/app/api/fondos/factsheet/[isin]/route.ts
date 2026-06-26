import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken } from '@/lib/microsoft/graph'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''

export async function GET(req: NextRequest, { params }: { params: { isin: string } }) {
  const session = await getSession()
  if (!session) return new NextResponse('No autorizado', { status: 401 })

  const isin = params.isin.toUpperCase()

  // Get factsheet record from Supabase
  const { data: fondo } = await supabaseAdmin
    .from('fondos')
    .select('id, asset_managers(name, slug)')
    .eq('isin', isin)
    .single()

  if (!fondo) return new NextResponse('Fondo no encontrado', { status: 404 })

  const { data: factsheet } = await supabaseAdmin
    .from('factsheets')
    .select('file_name')
    .eq('fondo_id', fondo.id)
    .eq('is_latest', true)
    .single()

  if (!factsheet) return new NextResponse('Factsheet no encontrado', { status: 404 })

  const manager = fondo.asset_managers as { name: string; slug: string } | null
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
