import { requireTenantContext } from '@/lib/auth/tenant-context'
import { query } from '@/lib/db'
import { getCatalogBranding } from '@/lib/repositories/store-settings-repository'

type SessionContextRow = {
  store_name: string
  store_slug: string
  system_name: string | null
  full_name: string
  profile_role: string
  membership_role: string
  permissions: unknown
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)

    const result = await query<SessionContextRow>(
      `select
         s.name as store_name,
         s.slug as store_slug,
         s.system_name,
         p.full_name,
         p.role as profile_role,
         su.role as membership_role,
         su.permissions
       from stores s
       join store_users su
         on su.store_id = s.id
        and su.organization_id = s.organization_id
        and su.installation_id = s.installation_id
       join app_profiles p
         on p.id = su.user_id
        and p.organization_id = su.organization_id
        and p.installation_id = su.installation_id
       where s.id = $1
         and s.organization_id = $2
         and s.installation_id = $3
         and su.user_id = $4
         and s.active = true
         and p.active = true
       limit 1`,
      [
        context.storeId,
        context.organizationId,
        context.installationId,
        context.userId,
      ]
    )

    const row = result.rows[0]

    if (!row) {
      return Response.json(
        { error: 'El usuario no tiene acceso a esta tienda.' },
        { status: 404 }
      )
    }

    const branding = await getCatalogBranding(context)

    return Response.json({
      storeId: context.storeId,
      platformName: 'CastelNova OS',
      storeName: row.store_name,
      storeSlug: row.store_slug,
      systemName: row.system_name || 'ShopDesk OS',
      storeLogoUrl: branding.logoUrl?.trim() || null,
      userName: row.full_name,
      userRole: row.membership_role || row.profile_role,
      permissions:
  row.permissions &&
  typeof row.permissions === 'object' &&
  !Array.isArray(row.permissions)
    ? row.permissions
    : null,
    })
  } catch (error) {
    console.error('[Session Context] Error:', error)

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo obtener el contexto de ShopDesk.',
      },
      { status: 503 }
    )
  }
}
