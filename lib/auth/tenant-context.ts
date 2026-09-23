export type ShopDeskPermission = string

/**
 * Server-derived identity and tenant scope.
 *
 * Production:
 * These values must originate from a validated CastelNova Identity token.
 *
 * Development:
 * A temporary tenant context may be loaded from server-only environment
 * variables when SHOPDESK_DEV_TENANT=true.
 */
export type TenantContext = Readonly<{
  userId: string
  organizationId: string
  installationId: string
  storeId: string
  role: string
  permissions: readonly ShopDeskPermission[]
}>

export class IdentityNotConfiguredError extends Error {
  constructor() {
    super('CastelNova Identity/Auth is not configured for ShopDesk yet.')
    this.name = 'IdentityNotConfiguredError'
  }
}

function getDevelopmentTenantContext(): TenantContext | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  if (process.env.SHOPDESK_DEV_TENANT !== 'true') {
    return null
  }

  const userId = process.env.SHOPDESK_DEV_USER_ID
  const organizationId = process.env.SHOPDESK_DEV_ORGANIZATION_ID
  const installationId = process.env.SHOPDESK_DEV_INSTALLATION_ID
  const storeId = process.env.SHOPDESK_DEV_STORE_ID

  if (!userId || !organizationId || !installationId || !storeId) {
    throw new Error(
      'ShopDesk development tenant is enabled but its environment variables are incomplete.'
    )
  }

  return {
    userId,
    organizationId,
    installationId,
    storeId,
    role: 'owner',
    permissions: ['*'],
  }
}

/**
 * Authentication boundary for ShopDesk.
 *
 * The temporary development context is intentionally disabled in production.
 * Once CastelNova Identity is implemented, the validated token will be
 * resolved here instead.
 *
 * Never derive tenant identifiers from browser-controlled headers,
 * query parameters or request bodies.
 */
export async function requireTenantContext(
  request: Request
): Promise<TenantContext> {
  const { getLocalSession } = await import('@/lib/auth/local-session')
  const localSession = await getLocalSession(request)
  if (localSession) {
    return {
      userId: localSession.userId,
      organizationId: localSession.organizationId,
      installationId: localSession.installationId,
      storeId: localSession.storeId,
      role: localSession.role,
      permissions: localSession.permissions,
    }
  }

  const developmentContext = getDevelopmentTenantContext()

  if (developmentContext) {
    return developmentContext
  }

  throw new IdentityNotConfiguredError()
}
