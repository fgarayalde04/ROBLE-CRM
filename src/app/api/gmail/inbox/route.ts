import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken } from '@/lib/google/tokens'
import { listInboxToday } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const accessToken = await getValidGoogleToken()
  if (!accessToken) {
    return NextResponse.json({ connected: false, messages: [] })
  }

  try {
    const messages = await listInboxToday(accessToken, 30)
    return NextResponse.json({ connected: true, messages })
  } catch (err: any) {
    console.error('[api/gmail/inbox]', err.message)
    return NextResponse.json({
      connected: true,
      messages: [],
      error: err.message,
    })
  }
}
