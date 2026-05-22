import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export const GOOGLE_TOKENS_COOKIE = 'google_tokens'

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

export interface GoogleTokenPayload {
  access_token:  string
  refresh_token?: string
  expires_at:    number   // Unix seconds
  email?:        string
  name?:         string
}

// ─── Supabase DB helpers ──────────────────────────────────────────────────────

async function saveToDb(userEmail: string, tokens: GoogleTokenPayload) {
  await supabaseAdmin.from('google_connections').upsert({
    user_email:    userEmail,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at:    tokens.expires_at,
    google_email:  tokens.email ?? null,
    google_name:   tokens.name ?? null,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'user_email' })
}

async function loadFromDb(userEmail: string): Promise<GoogleTokenPayload | null> {
  const { data } = await supabaseAdmin
    .from('google_connections')
    .select('access_token, refresh_token, expires_at, google_email, google_name')
    .eq('user_email', userEmail)
    .maybeSingle()

  if (!data) return null
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? undefined,
    expires_at:    data.expires_at,
    email:         data.google_email ?? undefined,
    name:          data.google_name  ?? undefined,
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

async function tokensToCookie(tokens: GoogleTokenPayload): Promise<string> {
  return new SignJWT({ ...tokens })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('365d')
    .sign(getSecret())
}

async function readCookie(): Promise<GoogleTokenPayload | null> {
  try {
    const raw = cookies().get(GOOGLE_TOKENS_COOKIE)?.value
    if (!raw) return null
    const { payload } = await jwtVerify(raw, getSecret())
    return {
      access_token:  payload.access_token  as string,
      refresh_token: payload.refresh_token as string | undefined,
      expires_at:    payload.expires_at    as number,
      email:         payload.email         as string | undefined,
      name:          payload.name          as string | undefined,
    }
  } catch {
    return null
  }
}

function setCookie(
  res: { cookies: { set: (...args: any[]) => void } },
  jwt: string
) {
  res.cookies.set(GOOGLE_TOKENS_COOKIE, jwt, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   365 * 24 * 60 * 60,
    path:     '/',
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called from the OAuth callback after exchanging the code.
 * Persists to DB (permanent) + cookie (cache).
 */
export async function storeGoogleTokens(
  tokens: GoogleTokenPayload,
  res: { cookies: { set: (...args: any[]) => void } },
  userEmail?: string
) {
  // Save to DB if we know the user
  const email = userEmail ?? (await getSession())?.email ?? null
  if (email) await saveToDb(email, tokens)

  // Always set cookie as fast-path cache
  const jwt = await tokensToCookie(tokens)
  setCookie(res, jwt)
}

/**
 * Read tokens: cookie first (fast), then DB fallback.
 * In Route Handlers the DB path also refreshes the cookie.
 */
export async function getGoogleTokens(): Promise<GoogleTokenPayload | null> {
  // Fast path: cookie
  const fromCookie = await readCookie()
  if (fromCookie) return fromCookie

  // Fallback: DB (cookie was cleared / different browser / expired)
  const session = await getSession()
  if (!session?.email) return null

  const fromDb = await loadFromDb(session.email)
  return fromDb
}

async function doRefresh(refreshToken: string): Promise<GoogleTokenPayload | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) {
      console.error('[google/tokens] Refresh failed:', await res.text())
      return null
    }
    const data = await res.json()
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at:    Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    }
  } catch {
    return null
  }
}

/**
 * Returns a valid access token, refreshing if expired.
 * Saves refreshed token back to DB so it's always up to date.
 */
export async function getValidGoogleToken(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  if (!tokens) return null

  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at > now + 300) return tokens.access_token
  if (!tokens.refresh_token) return null

  const fresh = await doRefresh(tokens.refresh_token)
  if (!fresh) return null

  // Persist refreshed token to DB
  const session = await getSession()
  if (session?.email) {
    const merged = { ...tokens, ...fresh }
    await saveToDb(session.email, merged)
  }

  return fresh.access_token
}

/** True if user has a Google connection (cookie or DB) */
export async function hasGoogleConnection(): Promise<boolean> {
  const fromCookie = await readCookie()
  if (fromCookie) return true

  const session = await getSession()
  if (!session?.email) return false

  const { data } = await supabaseAdmin
    .from('google_connections')
    .select('user_email')
    .eq('user_email', session.email)
    .maybeSingle()

  return !!data
}

/** Returns the Google account email */
export async function getGoogleEmail(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  return tokens?.email ?? null
}

/** Returns the Google display name */
export async function getGoogleName(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  return tokens?.name ?? null
}
