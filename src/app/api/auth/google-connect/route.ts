import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'


/**
 * GET /api/auth/google-connect
 * Initiates the Google OAuth flow.
 * Requires an active CRM session (any logged-in user).
 *
 * GET /api/auth/google-connect?mode=mesa — conecta la casilla compartida
 * trading@roblecapital.net (usada para detectar respuestas de clientes) en
 * vez del Gmail personal de quien está logueado. Admin-only: cualquier otro
 * rol es redirigido sin iniciar el flujo. El callback (mismo redirect_uri,
 * distinguido por `state`) guarda el token bajo una clave fija en vez del
 * email de sesión.
 *
 * GET /api/auth/google-connect?mode=inversiones — igual, para la casilla
 * inversiones@roblecapital.net (envíos de Plantillas a clientes).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  if (!session) {
    return NextResponse.redirect(`${base}/login`)
  }

  const mode = req.nextUrl.searchParams.get('mode')
  if ((mode === 'mesa' || mode === 'inversiones') && !ADMIN_ROLES.includes(session.role)) {
    return NextResponse.redirect(`${base}/settings?google_error=forbidden`)
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
  if (mode === 'mesa' || mode === 'inversiones') authUrl.searchParams.set('state', mode)

  return NextResponse.redirect(authUrl.toString())
}
