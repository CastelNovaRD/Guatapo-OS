import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  getCatalogBranding,
  updateCatalogBranding,
  type CatalogBranding,
} from '@/lib/repositories/store-settings-repository'

export const runtime = 'nodejs'

const fields = new Set([
  'publicName', 'primaryColor', 'accentColor', 'heroTitle',
  'heroSubtitle', 'logoUrl', 'heroBannerUrl', 'whatsapp',
])

function validBranding(value: unknown): value is CatalogBranding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (!Object.keys(input).every((key) => fields.has(key)) ||
    !Object.values(input).every((entry) => typeof entry === 'string' && entry.length <= 500)) return false

  const isColor = (entry: unknown) => entry === undefined || /^#[0-9a-f]{6}$/i.test(String(entry))
  const isPublicUrl = (entry: unknown) => entry === undefined || entry === '' || /^(https?:\/\/|\/)/.test(String(entry))
  return isColor(input.primaryColor) && isColor(input.accentColor) &&
    isPublicUrl(input.logoUrl) && isPublicUrl(input.heroBannerUrl) &&
    (input.whatsapp === undefined || input.whatsapp === '' || /^[0-9+()\s-]{7,24}$/.test(String(input.whatsapp)))
}

export async function GET(request: Request) {
  try {
    return Response.json(await getCatalogBranding(await requireTenantContext(request)))
  } catch {
    return Response.json({ error: 'Catalog branding is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)
    if (!validBranding(body)) return Response.json({ error: 'Invalid catalog branding.' }, { status: 400 })
    const updated = await updateCatalogBranding(await requireTenantContext(request), body)
    return updated
      ? Response.json(updated.web_settings.catalogBranding || {})
      : Response.json({ error: 'Store not found.' }, { status: 404 })
  } catch {
    return Response.json({ error: 'Catalog branding could not be saved.' }, { status: 503 })
  }
}
