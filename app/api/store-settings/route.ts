import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  getStoreSettings,
  updateStoreSettings,
  type UpdateStoreSettingsInput,
} from '@/lib/repositories/store-settings-repository'

export const runtime = 'nodejs'

const editableFields = new Set([
  'name',
  'slug',
  'system_name',
  'active',
  'phone',
  'whatsapp',
  'rnc',
  'pos_featured_products_limit',
  'quote_products_limit',
])
const tenantFields = new Set([
  'id', 'store_id', 'organization_id', 'installation_id',
  'storeId', 'organizationId', 'installationId',
])
const productLimits = new Set([5, 10, 20, 50])

function isOptionalText(value: unknown) {
  return value === undefined || value === null || typeof value === 'string'
}

function validUpdate(value: unknown): value is UpdateStoreSettingsInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  const fields = Object.keys(input)
  if (
    fields.length === 0 ||
    fields.some((field) => !editableFields.has(field) || tenantFields.has(field))
  ) return false

  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) return false
  if (input.slug !== undefined && (typeof input.slug !== 'string' || !input.slug.trim())) return false
  if (input.system_name !== undefined && (typeof input.system_name !== 'string' || !input.system_name.trim())) return false
  if (input.active !== undefined && typeof input.active !== 'boolean') return false
  if (!['phone', 'whatsapp', 'rnc'].every((field) => isOptionalText(input[field]))) return false
  if (
    input.pos_featured_products_limit !== undefined &&
    (typeof input.pos_featured_products_limit !== 'number' || !productLimits.has(input.pos_featured_products_limit))
  ) return false
  if (
    input.quote_products_limit !== undefined &&
    (typeof input.quote_products_limit !== 'number' || !productLimits.has(input.quote_products_limit))
  ) return false
  return true
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const settings = await getStoreSettings(context)

    if (!settings) {
      return Response.json(
        { error: 'Store not found.' },
        { status: 404 }
      )
    }

    return Response.json(settings)
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Store settings are unavailable.',
      },
      { status: 503 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireTenantContext(request)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    if (!validUpdate(body)) {
      return Response.json({ error: 'Invalid store settings update.' }, { status: 400 })
    }

    const settings = await updateStoreSettings(context, body)
    return settings
      ? Response.json(settings)
      : Response.json({ error: 'Store not found.' }, { status: 404 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Store settings are unavailable.' },
      { status: 503 }
    )
  }
}
