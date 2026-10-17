import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_HOSTS = new Set(['guatapo.com', 'www.guatapo.com'])

function hostnameFromRequest(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase().trim() || ''

  // Local development commonly includes a port in the Host header.
  return host.replace(/:\d+$/, '')
}

export function proxy(request: NextRequest) {
  // Guatapo no expone Server Actions. Reject malformed or automated action
  // requests before they reach Next's internal Server Action resolver.
  if (request.headers.has('next-action')) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const hostname = hostnameFromRequest(request)
  if (request.nextUrl.pathname !== '/') return NextResponse.next()

  if (!PUBLIC_HOSTS.has(hostname)) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/web'

  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
