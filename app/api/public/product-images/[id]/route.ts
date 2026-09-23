import { getPublicCatalogImage } from '@/lib/repositories/catalog-repository'
import { readStoredProductImage } from '@/lib/storage/product-image-storage'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id.trim()) return new Response(null, { status: 404 })

    const image = await getPublicCatalogImage(id)
    if (!image) return new Response(null, { status: 404 })

    const stored = await readStoredProductImage(image.imageUrl)
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
