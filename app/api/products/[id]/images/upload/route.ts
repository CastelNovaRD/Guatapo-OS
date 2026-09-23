import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createProductImage,
  listProductImages,
  ProductImagesProductNotFoundError,
} from '@/lib/repositories/product-images-repository'
import {
  ALLOWED_PRODUCT_IMAGE_MIME_TYPES,
  getMaxProductImageBytes,
  LocalFilesystemProductImageStorage,
} from '@/lib/storage/product-image-storage'

export const runtime = 'nodejs'

function formBoolean(formData: FormData, field: string) {
  if (!formData.has(field)) return undefined
  const value = formData.get(field)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function formInteger(formData: FormData, field: string) {
  if (!formData.has(field)) return undefined
  const value = formData.get(field)
  if (typeof value !== 'string' || value.trim() === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id: productId } = await params
    if (!productId.trim()) {
      return Response.json({ error: 'Product ID is required.' }, { status: 400 })
    }

    const formData = await request.formData()
    const protectedFields = [
      'organization_id', 'installation_id', 'store_id',
      'organizationId', 'installationId', 'storeId',
    ]
    if (protectedFields.some((field) => formData.has(field))) {
      return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    }

    const file = formData.get('file')
    const isPrimary = formBoolean(formData, 'isPrimary')
    const sortOrder = formInteger(formData, 'sortOrder')
    if (
      !(file instanceof File) ||
      file.size <= 0 ||
      file.size > getMaxProductImageBytes() ||
      !ALLOWED_PRODUCT_IMAGE_MIME_TYPES.has(file.type) ||
      isPrimary === null ||
      sortOrder === null
    ) {
      return Response.json({ error: 'Invalid product image upload.' }, { status: 400 })
    }

    // Verifies tenant ownership before any filesystem write.
    await listProductImages(context, productId)

    const storage = new LocalFilesystemProductImageStorage()
    const stored = await storage.upload(context, {
      productId,
      filename: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })

    try {
      const image = await createProductImage(context, productId, {
        imageUrl: stored.publicPath,
        isPrimary,
        sortOrder,
      })

      const publicImageUrl = `/api/public/product-images/${encodeURIComponent(image.id)}`
      return Response.json(
        {
          image: { ...image, image_url: publicImageUrl },
          imageUrl: publicImageUrl,
        },
        { status: 201 }
      )
    } catch (error) {
      try {
        await storage.remove(context, productId, stored.storagePath)
      } catch {
        // Metadata creation is still reported as failed without exposing filesystem details.
      }
      throw error
    }
  } catch (error) {
    if (error instanceof ProductImagesProductNotFoundError) {
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    }

    return Response.json({ error: 'Product image upload is unavailable.' }, { status: 503 })
  }
}
