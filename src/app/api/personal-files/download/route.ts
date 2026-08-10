import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSignedDownloadUrl } from '@/lib/storage/s3'

// GET /api/personal-files/download?key=personal-files/<user_id>/<file>
// Only serves keys under the requesting user's own prefix.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })
  if (!key.startsWith(`personal-files/${session.id}/`)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const url = await getSignedDownloadUrl(key, 60 * 10)
    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
