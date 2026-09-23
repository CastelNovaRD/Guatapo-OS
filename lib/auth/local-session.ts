import 'server-only'

import { createHash, randomBytes } from 'crypto'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export const LOCAL_SESSION_COOKIE = 'shopdesk_session'
const sessionLifetimeMs = 12 * 60 * 60 * 1000

type LocalSessionRow = {
  user_id: string
  organization_id: string
  installation_id: string
  store_id: string
  role: string
  permissions: unknown
  email: string
  full_name: string
}

export type LocalSession = TenantContext & {
  email: string
  fullName: string
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function getCookieValue(request: Request, name: string) {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function normalizePermissions(value: unknown): readonly string[] {
  if (Array.isArray(value) && value.every((permission) => typeof permission === 'string')) {
    return value
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([permission]) => permission)
  }
  return []
}

function mapSession(row: LocalSessionRow): LocalSession {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    storeId: row.store_id,
    role: row.role,
    permissions: normalizePermissions(row.permissions),
    email: row.email,
    fullName: row.full_name,
  }
}

export async function getLocalSession(request: Request) {
  const token = getCookieValue(request, LOCAL_SESSION_COOKIE)
  if (!token) return null

  const result = await query<LocalSessionRow>(
    `select s.user_id, p.organization_id, p.installation_id, su.store_id,
            su.role, su.permissions, p.email, p.full_name
       from shopdesk_auth_sessions s
       join app_profiles p on p.id = s.user_id and p.active = true
       join store_users su
         on su.user_id = p.id
        and su.organization_id = p.organization_id
        and su.installation_id = p.installation_id
       join stores st
         on st.id = su.store_id
        and st.organization_id = su.organization_id
        and st.installation_id = su.installation_id
        and st.active = true
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
      order by su.store_id
      limit 2`,
    [hashToken(token)]
  )
  return result.rows.length === 1 ? mapSession(result.rows[0]) : null
}

export async function createLocalSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionLifetimeMs)
  await query(
    `insert into shopdesk_auth_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt]
  )
  return { token, expiresAt }
}

export async function revokeLocalSession(request: Request) {
  const token = getCookieValue(request, LOCAL_SESSION_COOKIE)
  if (token) {
    await query(
      `update shopdesk_auth_sessions set revoked_at = now()
        where token_hash = $1 and revoked_at is null`,
      [hashToken(token)]
    )
  }
}

export async function revokeAllLocalSessions(userId: string) {
  await query(
    `update shopdesk_auth_sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId]
  )
}

export function localSessionCookie(token: string, expiresAt: Date, request: Request) {
  const url = new URL(request.url)
  return {
    name: LOCAL_SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || url.protocol === 'https:',
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
    },
  }
}
