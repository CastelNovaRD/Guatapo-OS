import { NextResponse } from 'next/server'

import { getLocalSession } from '@/lib/auth/local-session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await getLocalSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    return NextResponse.json({
      user: { id: session.userId, email: session.email, fullName: session.fullName, role: session.role },
      tenant: {
        organizationId: session.organizationId,
        installationId: session.installationId,
        storeId: session.storeId,
        permissions: session.permissions,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Local authentication is unavailable.' }, { status: 503 })
  }
}
