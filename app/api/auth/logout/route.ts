import { NextResponse } from 'next/server'

import { LOCAL_SESSION_COOKIE, revokeLocalSession } from '@/lib/auth/local-session'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    await revokeLocalSession(request)
    const response = NextResponse.json({ ok: true })
    response.cookies.set({ name: LOCAL_SESSION_COOKIE, value: '', path: '/', maxAge: 0 })
    return response
  } catch {
    return NextResponse.json({ error: 'Local authentication is unavailable.' }, { status: 503 })
  }
}
