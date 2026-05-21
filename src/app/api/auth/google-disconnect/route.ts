import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { GOOGLE_TOKENS_COOKIE } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

export async function POST() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(GOOGLE_TOKENS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}
