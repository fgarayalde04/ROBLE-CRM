import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? 'http://localhost:3000/api/auth/microsoft/callback'

  if (!tenantId || !clientId) {
    return NextResponse.json({ error: 'Microsoft no configurado' }, { status: 500 })
  }

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'openid email profile User.Read Files.Read.All Sites.Read.All offline_access')
  authUrl.searchParams.set('response_mode', 'query')

  return NextResponse.redirect(authUrl.toString())
}
