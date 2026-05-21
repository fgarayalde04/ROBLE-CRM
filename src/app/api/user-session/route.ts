import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'rc_user_name'

export async function GET() {
  const cookieStore = cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value ?? null
  return NextResponse.json({ user: value })
}

export async function POST(req: Request) {
  const { name } = await req.json()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, name, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
  })
  return response
}
