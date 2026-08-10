import { NextRequest, NextResponse } from 'next/server'
import { getSignedDownloadUrl } from '@/lib/storage/s3'

// GET /api/recursos/download?key=recursos/<path>
// Redirects to a freshly-signed URL — keeps stored file_url stable forever
// (S3 presigned URLs are capped at 7 days, so we can't store one permanently).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })

  try {
    const url = await getSignedDownloadUrl(key, 60 * 10)
    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
