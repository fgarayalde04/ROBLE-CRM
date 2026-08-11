import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmailForSSO, createPendingSSOUser } from '@/lib/db/users'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_DOMAINS = ['roblecapital.net']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam || !code) {
    return NextResponse.redirect(`${base}/login?error=google_cancelled`)
  }

  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri  = `${base}/api/auth/google-login/callback`

    // ── 1. Exchange code for access token ─────────────────────────────────
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
      console.error('[google-login callback] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${base}/login?error=google_token`)
    }

    const { access_token } = await tokenRes.json()

    // ── 2. Get user profile ────────────────────────────────────────────────
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!profileRes.ok) {
      return NextResponse.redirect(`${base}/login?error=google_profile`)
    }

    const profile = await profileRes.json()
    const email = ((profile.email as string | undefined) ?? '').toLowerCase().trim()
    const name = (profile.name as string | undefined) ?? email

    if (!email || profile.email_verified === false) {
      return NextResponse.redirect(`${base}/login?error=google_profile`)
    }

    // ── 3. Validate corporate domain ───────────────────────────────────────
    const domain = email.split('@')[1] ?? ''
    if (!ALLOWED_DOMAINS.includes(domain)) {
      return NextResponse.redirect(
        `${base}/login?error=domain_not_allowed&domain=${encodeURIComponent(domain)}`
      )
    }

    // ── 4. Find or create user in crm_users ────────────────────────────────
    const existing = await findUserByEmailForSSO(email)

    if (existing) {
      const isPending =
        Array.isArray(existing.permissions) && existing.permissions.includes('_pending_approval')

      if (!existing.active && isPending) {
        return NextResponse.redirect(`${base}/login?error=pending_approval`)
      }
      if (!existing.active) {
        return NextResponse.redirect(`${base}/login?error=suspended`)
      }

      const token = await createSession({
        id: existing.id,
        name: existing.name,
        email: existing.email,
        role: existing.role,
      })
      const res = NextResponse.redirect(`${base}/`)
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })
      return res
    }

    // ── 5. New user → create with pending_approval ─────────────────────────
    try {
      await createPendingSSOUser(name, email)
    } catch (createError) {
      console.error('[google-login callback] Create user failed:', createError)
      return NextResponse.redirect(`${base}/login?error=create_failed`)
    }

    return NextResponse.redirect(`${base}/login?error=pending_approval`)
  } catch (err) {
    console.error('[google-login callback] Unexpected error:', err)
    return NextResponse.redirect(`${base}/login?error=unknown`)
  }
}
