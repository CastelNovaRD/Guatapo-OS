import { NextResponse } from 'next/server'

import { createLocalSession, getLocalSession, localSessionCookie } from '@/lib/auth/local-session'
import { verifyPassword } from '@/lib/auth/passwords'
import { query } from '@/lib/db'

export const runtime = 'nodejs'

type AccountRow = {
  id: string
  password_hash: string | null
}

function publicSession(session: NonNullable<Awaited<ReturnType<typeof getLocalSession>>>) {
  return {
    user: { id: session.userId, email: session.email, fullName: session.fullName, role: session.role },
    tenant: {
      organizationId: session.organizationId,
      installationId: session.installationId,
      storeId: session.storeId,
      permissions: session.permissions,
    },
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })

    const accounts = await query<AccountRow>(
      `select p.id, p.password_hash
         from app_profiles p
         join store_users su
           on su.user_id = p.id
          and su.organization_id = p.organization_id
          and su.installation_id = p.installation_id
         join stores st
           on st.id = su.store_id
          and st.organization_id = su.organization_id
          and st.installation_id = su.installation_id
        where lower(p.email) = $1
          and p.active = true
          and st.active = true
        group by p.id, p.password_hash
        having count(*) = 1
        limit 2`,
      [email]
    )
    const account = accounts.rows.length === 1 ? accounts.rows[0] : null
    const valid = account?.password_hash
      ? await verifyPassword(password, account.password_hash)
      : false
    if (!account || !valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const created = await createLocalSession(account.id)
    const session = await getLocalSession(new Request(request.url, {
      headers: { cookie: `shopdesk_session=${encodeURIComponent(created.token)}` },
    }))
    if (!session) return NextResponse.json({ error: 'Unable to create a local session.' }, { status: 503 })

    const response = NextResponse.json(publicSession(session))
    response.cookies.set(localSessionCookie(created.token, created.expiresAt, request))
    return response
  } catch {
    return NextResponse.json({ error: 'Local authentication is unavailable.' }, { status: 503 })
  }
}
