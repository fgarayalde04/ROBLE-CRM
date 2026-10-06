import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPlantilla } from '@/lib/db/plantillas'
import { generarPdfPlantilla, nombreArchivo } from '@/lib/plantillas/pdf'

export const maxDuration = 60

// GET /api/plantillas/[id]/pdf — descarga el PDF del documento.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  try {
    const pdf = await generarPdfPlantilla(doc.id, doc.tipo, session)
    const nombre = nombreArchivo(doc.titulo)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
