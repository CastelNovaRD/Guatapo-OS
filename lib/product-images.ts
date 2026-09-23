export type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

const LOCAL_PRODUCT_IMAGE_PREFIX = '/product-images/'

/**
 * Storage paths are never browser URLs. Local files use the guarded public
 * route; existing external image URLs remain usable without rewriting them.
 */
export function resolveProductImageUrl(
  image: Pick<ProductImage, 'id' | 'image_url'> | null | undefined
) {
  if (!image?.image_url) return null

  return image.image_url.startsWith(LOCAL_PRODUCT_IMAGE_PREFIX)
    ? `/api/public/product-images/${encodeURIComponent(image.id)}`
    : image.image_url
}

export function getProductMainImage(
  productId: string,
  fallback: string | null,
  images: ProductImage[]
) {
  const productImages = images.filter((img) => img.product_id === productId)
  const primary = productImages.find((img) => img.is_primary)

  return resolveProductImageUrl(primary || productImages[0]) || fallback
}
