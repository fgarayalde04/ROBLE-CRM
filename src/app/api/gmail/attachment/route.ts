import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const messageId    = searchParams.get('messageId')
  const attachmentId = searchParams.get('attachmentId')
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const accessToken = await getValidGoogleToken()
  if (!accessToken) return NextResponse.json({ error: 'Sin conexión Google' }, { status: 403 })

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const data = await res.json()
    // Gmail returns base64url-encoded data
    const b64 = (data.data as string).replace(/-/g, '+').replace(/_/g, '/')
    const binary = Buffer.from(b64, 'base64')

    return new NextResponse(binary, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
