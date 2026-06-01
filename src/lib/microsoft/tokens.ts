import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const MS_TOKENS_COOKIE = 'ms_tokens'

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

export interface MsTokenPayload {
  access_token: string
  refresh_token?: string
  expires_at: number // Unix seconds
}

/** Encode tokens into a signed JWT cookie and set it on the response */
export async function storeMsTokens(
  tokens: MsTokenPayload,
  res: { cookies: { set: (...args: any[]) => void } }
) {
  const jwt = await new SignJWT({ ...tokens })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret())

  res.cookies.set(MS_TOKENS_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
}

/** Read and verify the ms_tokens cookie. Returns null if absent or invalid. */
export async function getMsTokens(): Promise<MsTokenPayload | null> {
  try {
    const cookieStore = cookies()
    const raw = cookieStore.get(MS_TOKENS_COOKIE)?.value
    if (!raw) return null

    const { payload } = await jwtVerify(raw, getSecret())
    return {
      access_token: payload.access_token as string,
      refresh_token: payload.refresh_token as string | undefined,
      expires_at: payload.expires_at as number,
    }
  } catch {
    return null
  }
}

async function doRefresh(refreshToken: string): Promise<MsTokenPayload | null> {
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: refreshToken,
          scope:
            'openid email profile User.Read Files.Read.All Sites.Read.All Calendars.Read Calendars.ReadWrite offline_access',
        }),
      }
    )
    if (!res.ok) return null

    const data = await res.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    }
  } catch {
    return null
  }
}

/**
 * Returns a valid access token, refreshing if needed.
 * Note: refreshed tokens are used for the current request only and are not
 * persisted back to the cookie (next login will issue fresh tokens).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getMsTokens()
  if (!tokens) return null

  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at > now + 300) return tokens.access_token
  if (!tokens.refresh_token) return null

  const fresh = await doRefresh(tokens.refresh_token)
  return fresh?.access_token ?? null
}

/** True if there is any ms_tokens cookie present (may be expired) */
export async function hasMsConnection(): Promise<boolean> {
  const cookieStore = cookies()
  return !!cookieStore.get(MS_TOKENS_COOKIE)?.value
}
