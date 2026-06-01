import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import { storeMsTokens } from '@/lib/microsoft/tokens'

export const dynamic = 'force-dynamic'

const ALLOWED_DOMAINS = ['roblecapital.net', 'roblecapital.onmicrosoft.com']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (errorParam || !code) {
    return NextResponse.redirect(`${base}/login?error=microsoft_cancelled`)
  }

  try {
    const tenantId    = process.env.MICROSOFT_TENANT_ID!
    const clientId    = process.env.MICROSOFT_CLIENT_ID!
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
    const redirectUri =
      process.env.MICROSOFT_REDIRECT_URI ?? 'http://localhost:3000/api/auth/microsoft/callback'

    // ── 1. Exchange code for access token ─────────────────────────────────────
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          code,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
          scope:         'openid email profile User.Read Files.Read.All Sites.Read.All offline_access',
        }),
      }
    )

    if (!tokenRes.ok) {
      console.error('[ms-callback] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${base}/login?error=microsoft_token`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // ── 2. Get user profile from Microsoft Graph ──────────────────────────────
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!meRes.ok) {
      return NextResponse.redirect(`${base}/login?error=microsoft_profile`)
    }

    const me = await meRes.json()
    const email = (
      (me.mail ?? me.userPrincipalName) as string | undefined ?? ''
    ).toLowerCase().trim()
    const name = (me.displayName ?? me.givenName ?? email) as string

    if (!email) {
      return NextResponse.redirect(`${base}/login?error=microsoft_profile`)
    }

    // ── 3. Validate corporate domain ─────────────────────────────────────────
    const domain = email.split('@')[1] ?? ''
    if (!ALLOWED_DOMAINS.includes(domain)) {
      return NextResponse.redirect(
        `${base}/login?error=domain_not_allowed&domain=${encodeURIComponent(domain)}`
      )
    }

    // ── 4. Find or create user in crm_users ──────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('crm_users')
      .select('id, name, email, role, active, permissions')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      const isPending =
        Array.isArray(existing.permissions) &&
        existing.permissions.includes('_pending_approval')

      if (!existing.active && isPending) {
        return NextResponse.redirect(`${base}/login?error=pending_approval`)
      }
      if (!existing.active) {
        return NextResponse.redirect(`${base}/login?error=suspended`)
      }

      // Active user → issue CRM session
      const token = await createSession({
        id:    existing.id,
        name:  existing.name,
        email: existing.email,
        role:  existing.role,
      })
      const res = NextResponse.redirect(`${base}/`)
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge:   SESSION_MAX_AGE,
        path:     '/',
      })
      await storeMsTokens(
        {
          access_token,
          refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (expires_in ?? 3600),
        },
        res
      )
      return res
    }

    // ── 5. New user → create with pending_approval ────────────────────────────
    const { error: createError } = await supabaseAdmin.from('crm_users').insert({
      name,
      email,
      role:        'asesor',
      active:      false,
      permissions: ['_pending_approval'],
    })

    if (createError) {
      console.error('[ms-callback] Create user failed:', createError)
      return NextResponse.redirect(`${base}/login?error=create_failed`)
    }

    return NextResponse.redirect(`${base}/login?error=pending_approval`)
  } catch (err) {
    console.error('[ms-callback] Unexpected error:', err)
    return NextResponse.redirect(`${base}/login?error=unknown`)
  }
}
