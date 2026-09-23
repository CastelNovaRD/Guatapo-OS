import { NextResponse } from 'next/server'

import { getLocalSession, LOCAL_SESSION_COOKIE, revokeAllLocalSessions } from '@/lib/auth/local-session'
import { hashPassword, validatePassword } from '@/lib/auth/passwords'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

export async function PATCH(request: Request) {
  try {
    const session = await getLocalSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })

    const body = await request.json().catch(() => null) as { newPassword?: unknown } | null
    const password = typeof body?.newPassword === 'string' ? body.newPassword : ''
    const error = validatePassword(password)
    if (error) return NextResponse.json({ error }, { status: 400 })

    const result = await query(
      `update app_profiles
          set password_hash = $1, password_changed_at = now()
        where id = $2
          and organization_id = $3
          and installation_id = $4
          and active = true`,
      [await hashPassword(password), session.userId, session.organizationId, session.installationId]
    )
    if ((result.rowCount ?? 0) !== 1) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

    await revokeAllLocalSessions(session.userId)
    const response = NextResponse.json({ ok: true })
    response.cookies.set({ name: LOCAL_SESSION_COOKIE, value: '', path: '/', maxAge: 0 })
    return response
  } catch {
    return NextResponse.json({ error: 'Local authentication is unavailable.' }, { status: 503 })
  }
}
