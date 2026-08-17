import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSignedDownloadUrl } from '@/lib/storage/s3'

// GET /api/research/download?key=research/<path> — mismo patrón que /api/recursos/download.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })

  try {
    const url = await getSignedDownloadUrl(key, 60 * 10)
    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
