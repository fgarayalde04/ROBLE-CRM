import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

function decodeBase64Url(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(b64, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

type AttachmentInfo = { filename: string; mimeType: string; attachmentId: string; size: number }

function extractAttachments(payload: any, results: AttachmentInfo[] = []): AttachmentInfo[] {
  if (!payload) return results
  if (payload.body?.attachmentId && payload.filename) {
    results.push({
      filename: payload.filename,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      attachmentId: payload.body.attachmentId,
      size: payload.body.size ?? 0,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      extractAttachments(part, results)
    }
  }
  return results
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  // Multipart: prefer text/plain, fallback to text/html
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64Url(plain.body.data)

    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) {
      // Strip HTML tags for plain display
      return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, '\n').trim()
    }

    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const accessToken = await getValidGoogleToken()
  if (!accessToken) return NextResponse.json({ error: 'Sin conexión Google' }, { status: 403 })

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    const msg = await res.json()
    const body = extractBody(msg.payload)
    const attachments = extractAttachments(msg.payload)

    return NextResponse.json({ body, attachments })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
