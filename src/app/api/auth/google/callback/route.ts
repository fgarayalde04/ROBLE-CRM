import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { storeGoogleTokens, GOOGLE_TOKENS_COOKIE, MESA_GOOGLE_CONNECTION_KEY } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth callback.
 * Exchanges the authorization code for tokens and stores them in a secure cookie.
 * Redirects to /settings on success.
 *
 * Cuando `state=mesa` (iniciado desde google-connect?mode=mesa), el token se
 * guarda bajo la clave fija de la casilla de Mesa en vez del email de sesión
 * de quien está logueado, y NO se pisa la cookie personal de esa persona con
 * el token de la casilla compartida.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const isMesa = searchParams.get('state') === 'mesa'

  if (errorParam || !code) {
    return NextResponse.redirect(`${base}/settings?google_error=cancelled`)
  }

  // Must be logged into CRM
  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(`${base}/login`)
  }
  if (isMesa && !ADMIN_ROLES.includes(session.role)) {
    return NextResponse.redirect(`${base}/settings?google_error=forbidden`)
  }

  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri  =
      process.env.GOOGLE_REDIRECT_URI ??
      'http://localhost:3000/api/auth/google/callback'

    // ── 1. Exchange code for tokens ───────────────────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('[google/callback] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${base}/settings?google_error=token`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    // ── 2. Get user profile ───────────────────────────────────────────────
    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    let googleEmail: string | undefined
    let googleName: string | undefined

    if (profileRes.ok) {
      const profile = await profileRes.json()
      googleEmail = profile.email as string | undefined
      googleName  = profile.name  as string | undefined
    }

    // ── 3. Store tokens ────────────────────────────────────────────────────
    const res = NextResponse.redirect(`${base}/settings?${isMesa ? 'mesa_connected=1' : 'google_connected=1'}`)
    await storeGoogleTokens(
      {
        access_token,
        refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (expires_in ?? 3600),
        email: googleEmail,
        name:  googleName,
      },
      res,
      isMesa ? MESA_GOOGLE_CONNECTION_KEY : undefined
    )
    // La casilla de Mesa se guarda solo en la DB — nunca en la cookie de
    // sesión rápida, para no pisar la conexión personal de quien hizo el
    // consentimiento (storeGoogleTokens siempre setea esa cookie como cache).
    if (isMesa) res.cookies.delete(GOOGLE_TOKENS_COOKIE)

    return res
  } catch (err) {
    console.error('[google/callback] Unexpected error:', err)
    return NextResponse.redirect(`${base}/settings?google_error=unknown`)
  }
}
