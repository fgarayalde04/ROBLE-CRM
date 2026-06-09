import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

// Mobile user-agent detection
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

  const token = req.cookies.get('crm_session')?.value
  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret-change-me')
    await jwtVerify(token, secret)

    // Modo Asesor: redirect / → /ordenes based on preference + UA
    if (pathname === '/') {
      const ua = req.headers.get('user-agent') ?? ''
      const advisorCookie = req.cookies.get('advisor_mode')?.value

      let shouldRedirect: boolean
      if (advisorCookie === '0') {
        // User explicitly turned Modo Asesor OFF — never redirect
        shouldRedirect = false
      } else if (advisorCookie === '1') {
        // User explicitly turned Modo Asesor ON — redirect on all devices
        shouldRedirect = true
      } else {
        // No explicit preference saved yet — default ON for mobile
        shouldRedirect = isMobileUA(ua)
      }

      if (shouldRedirect) {
        const ordenes = req.nextUrl.clone()
        ordenes.pathname = '/ordenes'
        return NextResponse.redirect(ordenes)
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
