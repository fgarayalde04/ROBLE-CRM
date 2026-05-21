import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const GOOGLE_TOKENS_COOKIE = 'google_tokens'

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

export interface GoogleTokenPayload {
  access_token: string
  refresh_token?: string
  expires_at: number // Unix seconds
  email?: string
  name?: string
}

/** Encode tokens into a signed JWT cookie and set it on the response */
export async function storeGoogleTokens(
  tokens: GoogleTokenPayload,
  res: { cookies: { set: (...args: any[]) => void } }
) {
  const jwt = await new SignJWT({ ...tokens })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('60d')
    .sign(getSecret())

  res.cookies.set(GOOGLE_TOKENS_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 24 * 60 * 60,
    path: '/',
  })
}

/** Read and verify the google_tokens cookie. Returns null if absent or invalid. */
export async function getGoogleTokens(): Promise<GoogleTokenPayload | null> {
  try {
    const cookieStore = cookies()
    const raw = cookieStore.get(GOOGLE_TOKENS_COOKIE)?.value
    if (!raw) return null

    const { payload } = await jwtVerify(raw, getSecret())
    return {
      access_token: payload.access_token as string,
      refresh_token: payload.refresh_token as string | undefined,
      expires_at: payload.expires_at as number,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    }
  } catch {
    return null
  }
}

async function doRefresh(refreshToken: string): Promise<GoogleTokenPayload | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.GOOGLE_CLIENT_ID!,
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
      access_token: data.access_token,
      // Google only returns a new refresh_token occasionally
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    }
  } catch {
    return null
  }
}

/**
 * Returns a valid access token, auto-refreshing if within 5 minutes of expiry.
 * Token refresh result is used in-memory for the current request only.
 * Next login will issue fresh tokens.
 */
export async function getValidGoogleToken(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  if (!tokens) return null

  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at > now + 300) return tokens.access_token
  if (!tokens.refresh_token) return null

  const fresh = await doRefresh(tokens.refresh_token)
  return fresh?.access_token ?? null
}

/** True if the user has connected their Google account */
export async function hasGoogleConnection(): Promise<boolean> {
  const cookieStore = cookies()
  return !!cookieStore.get(GOOGLE_TOKENS_COOKIE)?.value
}

/** Returns the Google account email, or null if not connected */
export async function getGoogleEmail(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  return tokens?.email ?? null
}

/** Returns display name from Google tokens, or null */
export async function getGoogleName(): Promise<string | null> {
  const tokens = await getGoogleTokens()
  return tokens?.name ?? null
}
