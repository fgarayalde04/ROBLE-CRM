import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/google-login',
  '/api/auth/microsoft-login',
  '/api/auth/microsoft/callback',
  // PWA assets — must be reachable without a session (installed icon, SW registration)
  '/manifest.json',
  '/sw.js',
  '/icons/',
  '/apple-touch-icon.png',
]

// Paths accessible to users with modo_asesor enabled (server-controlled)
const ASESOR_ALLOWED = [
  '/ordenes',
  '/mail',
  '/inbox',
  '/settings',
  '/change-password',
  '/api/',
]

function isMobileUA(ua: string): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|svg|ico|webp)$/)
  ) {
    return NextResponse.next()
  }

  // Worker-to-worker call (WhatsApp brief worker → Roble), authenticated with a
  // shared secret instead of a user session — checked here since middleware
  // would otherwise redirect it to /login before the route ever runs.
  if (pathname === '/api/research/morning-brief' && req.method === 'POST') {
    const workerSecret = req.headers.get('x-worker-secret')
    if (workerSecret && process.env.RESEARCH_WORKER_SECRET && workerSecret === process.env.RESEARCH_WORKER_SECRET) {
      return NextResponse.next()
    }
  }

  // External webhook call (Zapia → Roble), authenticated with a bearer secret.
  if (pathname === '/api/research/zapia-webhook' && req.method === 'POST') {
    const auth = req.headers.get('authorization')
    if (auth && process.env.ZAPIA_WEBHOOK_SECRET && auth === `Bearer ${process.env.ZAPIA_WEBHOOK_SECRET}`) {
      return NextResponse.next()
    }
  }

  const token = req.cookies.get('crm_session')?.value
  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret-change-me')
    const { payload } = await jwtVerify(token, secret)

    // ── Modo Asesor (admin-controlled, stored in JWT) ─────────────────────────
    // Restricts access to a narrow set of pages regardless of device
    // Admins are never restricted — safety net in case admin's own account is toggled
    if ((payload as any).modo_asesor === true && (payload as any).role !== 'admin') {
      const allowed = ASESOR_ALLOWED.some((p) => pathname.startsWith(p))
      if (!allowed) {
        const dest = req.nextUrl.clone()
        dest.pathname = '/ordenes'
        return NextResponse.redirect(dest)
      }
      return NextResponse.next()
    }

    // ── Standard users: client-side advisor mode (redirect / → /ordenes) ─────
    if (pathname === '/') {
      const ua = req.headers.get('user-agent') ?? ''
      const advisorCookie = req.cookies.get('advisor_mode')?.value

      let shouldRedirect: boolean
      if (advisorCookie === '0') {
        shouldRedirect = false
      } else if (advisorCookie === '1') {
        shouldRedirect = true
      } else {
        shouldRedirect = isMobileUA(ua)
      }

      if (shouldRedirect) {
        const dest = req.nextUrl.clone()
        dest.pathname = '/ordenes'
        return NextResponse.redirect(dest)
      }
    }

    return NextResponse.next()
  } catch {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
