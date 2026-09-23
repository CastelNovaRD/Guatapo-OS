import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getCatalogBranding, getStoreSettings, updateCatalogBranding } from '@/lib/repositories/store-settings-repository'
import { catalogBrandingPublicUrl, CATALOG_BRANDING_ASSET_KINDS, parseCatalogBrandingPublicUrl, removeCatalogBrandingAsset, uploadCatalogBrandingAsset } from '@/lib/storage/catalog-branding-storage'

export const runtime = 'nodejs'

function isKind(value: string): value is 'logo' | 'banner' {
  return (CATALOG_BRANDING_ASSET_KINDS as readonly string[]).includes(value)
}

function brandingField(kind: 'logo' | 'banner') {
  return kind === 'logo' ? 'logoUrl' : 'heroBannerUrl'
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const { kind: candidate } = await params
    if (!isKind(candidate)) return Response.json({ error: 'Unsupported branding asset.' }, { status: 400 })

    const formData = await request.formData()
    const protectedFields = ['organization_id', 'installation_id', 'store_id', 'organizationId', 'installationId', 'storeId']
    if (protectedFields.some((field) => formData.has(field))) return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    const file = formData.get('file')
    if (!(file instanceof File) || !file.size) return Response.json({ error: 'A catalog image is required.' }, { status: 400 })

    const store = await getStoreSettings(context)
    if (!store) return Response.json({ error: 'Store not found.' }, { status: 404 })
    const previous = await getCatalogBranding(context)
    const previousFilename = parseCatalogBrandingPublicUrl(previous[brandingField(candidate)], store.slug, candidate)
    const stored = await uploadCatalogBrandingAsset(context, candidate, { mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })
    const publicUrl = catalogBrandingPublicUrl(store.slug, candidate, stored.filename)
    const updated = await updateCatalogBranding(context, { [brandingField(candidate)]: publicUrl })
    if (!updated) {
      try { await removeCatalogBrandingAsset(context, candidate, stored.filename) } catch { /* The safe cleanup is best effort. */ }
      return Response.json({ error: 'Store not found.' }, { status: 404 })
    }
    if (previousFilename) {
      try { await removeCatalogBrandingAsset(context, candidate, previousFilename) } catch { /* The replacement remains valid. */ }
    }
    return Response.json({ url: publicUrl }, { status: 201 })
  } catch {
    return Response.json({ error: 'Catalog branding image could not be uploaded.' }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const { kind: candidate } = await params
    if (!isKind(candidate)) return Response.json({ error: 'Unsupported branding asset.' }, { status: 400 })
    const store = await getStoreSettings(context)
    if (!store) return Response.json({ error: 'Store not found.' }, { status: 404 })
    const current = await getCatalogBranding(context)
    const field = brandingField(candidate)
    const configuredUrl = current[field]
    if (!configuredUrl) return Response.json({ error: 'Catalog branding image not found.' }, { status: 404 })
    const filename = parseCatalogBrandingPublicUrl(configuredUrl, store.slug, candidate)
    const updated = await updateCatalogBranding(context, { [field]: '' })
    if (!updated) return Response.json({ error: 'Store not found.' }, { status: 404 })
    if (filename) {
      try { await removeCatalogBrandingAsset(context, candidate, filename) } catch { /* Metadata is safely removed even if the stale file is absent. */ }
    }
    return new Response(null, { status: 204 })
  } catch {
    return Response.json({ error: 'Catalog branding image could not be deleted.' }, { status: 503 })
  }
}
