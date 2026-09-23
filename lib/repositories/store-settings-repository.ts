import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type StorePosSettings = {
  pos_featured_products_limit: number
}

export type StoreSettings = {
  id: string
  name: string
  slug: string
  system_name: string | null
  active: boolean
  phone: string | null
  whatsapp: string | null
  rnc: string | null
  pos_featured_products_limit: number
  quote_products_limit: number
  web_settings: Record<string, unknown>
}

export type CatalogBranding = {
  publicName?: string
  primaryColor?: string
  accentColor?: string
  heroTitle?: string
  heroSubtitle?: string
  logoUrl?: string
  heroBannerUrl?: string
  whatsapp?: string
}

export type UpdateStoreSettingsInput = Partial<
  Pick<
    StoreSettings,
    | 'name'
    | 'slug'
    | 'system_name'
    | 'active'
    | 'phone'
    | 'whatsapp'
    | 'rnc'
    | 'pos_featured_products_limit'
    | 'quote_products_limit'
  >
>

const scope = (context: TenantContext) => [
  context.storeId,
  context.organizationId,
  context.installationId,
]
const editableColumns = [
  'name',
  'slug',
  'system_name',
  'active',
  'phone',
  'whatsapp',
  'rnc',
  'pos_featured_products_limit',
  'quote_products_limit',
] as const

export async function getStorePosSettings(context: TenantContext) {
  return (
    await query<StorePosSettings>(
      `select pos_featured_products_limit
         from stores
        where id = $1
          and organization_id = $2
          and installation_id = $3`,
      scope(context)
    )
  ).rows[0] ?? null
}

export async function getStoreSettings(context: TenantContext) {
  return (
    await query<StoreSettings>(
      `select id, name, slug, system_name, active, phone, whatsapp, rnc,
              pos_featured_products_limit, quote_products_limit, web_settings
         from stores
        where id = $1
          and organization_id = $2
          and installation_id = $3`,
      scope(context)
    )
  ).rows[0] ?? null
}

export async function updateStoreSettings(
  context: TenantContext,
  input: UpdateStoreSettingsInput
) {
  const columns = editableColumns
    .filter((column) => input[column] !== undefined)
    .map((column) => [column, input[column]] as const)
  if (columns.length === 0) return getStoreSettings(context)

  const values = columns.map(([, value]) => value)
  const assignments = columns.map(([column], index) => `${column} = $${index + 1}`)
  values.push(...scope(context))

  return (
    await query<StoreSettings>(
      `update stores
          set ${assignments.join(', ')}
        where id = $${values.length - 2}
          and organization_id = $${values.length - 1}
          and installation_id = $${values.length}
        returning id, name, slug, system_name, active, phone, whatsapp, rnc,
                  pos_featured_products_limit, quote_products_limit, web_settings`,
      values
    )
  ).rows[0] ?? null
}

export async function getCatalogBranding(context: TenantContext) {
  const settings = await getStoreSettings(context)
  const branding = settings?.web_settings?.catalogBranding
  return branding && typeof branding === 'object' && !Array.isArray(branding)
    ? branding as CatalogBranding
    : {}
}

export async function updateCatalogBranding(context: TenantContext, branding: CatalogBranding) {
  const result = await query<{ slug: string; web_settings: Record<string, unknown> }>(
    `update stores
        set web_settings = jsonb_set(
          coalesce(web_settings, '{}'::jsonb),
          '{catalogBranding}',
          coalesce(web_settings -> 'catalogBranding', '{}'::jsonb) || $1::jsonb,
          true
        )
      where id = $2
        and organization_id = $3
        and installation_id = $4
      returning slug, web_settings`,
    [JSON.stringify(branding), ...scope(context)]
  )
  return result.rows[0] ?? null
}

export async function updateWebSettings(
  context: TenantContext,
  webSettings: Record<string, unknown>
) {
  return (
    await query<StoreSettings>(
      `update stores
          set web_settings = $1::jsonb
        where id = $2
          and organization_id = $3
          and installation_id = $4
        returning id, name, slug, system_name, active, phone, whatsapp, rnc,
                  pos_featured_products_limit, quote_products_limit, web_settings`,
      [JSON.stringify(webSettings), ...scope(context)]
    )
  ).rows[0] ?? null
}