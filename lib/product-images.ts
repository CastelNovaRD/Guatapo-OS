export type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

export function getProductMainImage(
  productId: string,
  fallback: string | null,
  images: ProductImage[]
) {
  const productImages = images.filter((img) => img.product_id === productId)
  const primary = productImages.find((img) => img.is_primary)

  return primary?.image_url || productImages[0]?.image_url || fallback
}