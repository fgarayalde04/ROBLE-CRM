import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/google-connect
 * Initiates the Google OAuth flow.
 * Requires an active CRM session (any logged-in user).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    'http://localhost:3000/api/auth/google/callback'

  if (!clientId) {
    return NextResponse.json(
      { error: 'Google OAuth no configurado. Agregá GOOGLE_CLIENT_ID en .env.local' },
      { status: 500 }
    )
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set(
    'scope',
    [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' ')
  )
  authUrl.searchParams.set('access_type', 'offline')   // get refresh_token
  authUrl.searchParams.set('prompt', 'consent')         // always show consent to get refresh_token
  authUrl.searchParams.set('include_granted_scopes', 'true')

  return NextResponse.redirect(authUrl.toString())
}
