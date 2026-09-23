import { getPublicCatalogBrandingAsset } from '@/lib/repositories/catalog-repository'
import { catalogBrandingPublicUrl, CATALOG_BRANDING_ASSET_KINDS, readCatalogBrandingAsset } from '@/lib/storage/catalog-branding-storage'

export const runtime = 'nodejs'

function isKind(value: string): value is 'logo' | 'banner' {
  return (CATALOG_BRANDING_ASSET_KINDS as readonly string[]).includes(value)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; kind: string; filename: string }> }
) {
  try {
    const { slug, kind: candidate, filename } = await params
    if (!slug.trim() || !filename.trim() || !isKind(candidate)) return new Response(null, { status: 404 })
    const expectedUrl = catalogBrandingPublicUrl(slug, candidate, filename)
    const asset = await getPublicCatalogBrandingAsset(slug, candidate, expectedUrl)
    if (!asset) return new Response(null, { status: 404 })
    const stored = await readCatalogBrandingAsset(asset, candidate, filename)
    return new Response(new Uint8Array(stored.bytes).buffer, {
      headers: {
        'Content-Type': stored.mimeType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
