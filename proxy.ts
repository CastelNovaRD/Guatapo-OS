import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_HOSTS = new Set(['guatapo.com', 'www.guatapo.com'])

function hostnameFromRequest(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase().trim() || ''

  // Local development commonly includes a port in the Host header.
  return host.replace(/:\d+$/, '')
}

export function proxy(request: NextRequest) {
  if (!PUBLIC_HOSTS.has(hostnameFromRequest(request))) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/web'

  return NextResponse.rewrite(url)
}

export const config = {
  matcher: '/',
}
