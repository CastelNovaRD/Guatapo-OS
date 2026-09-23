import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  deleteProductImage,
  ProductImageNotFoundError,
  ProductImagesProductNotFoundError,
  type UpdateProductImageInput,
  updateProductImage,
} from '@/lib/repositories/product-images-repository'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id, imageId } = await params

    if (!id.trim() || !imageId.trim()) {
      return Response.json({ error: 'Product and image IDs are required.' }, { status: 400 })
    }

    const image = await deleteProductImage(context, id, imageId)
    return Response.json(image)
  } catch (error) {
    if (
      error instanceof ProductImagesProductNotFoundError ||
      error instanceof ProductImageNotFoundError
    ) {
      return Response.json({ error: 'Product image not found.' }, { status: 404 })
    }

    return Response.json({ error: 'Product image metadata is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id, imageId } = await params
    if (!id.trim() || !imageId.trim()) {
      return Response.json({ error: 'Product and image IDs are required.' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    const allowedFields = new Set(['isPrimary', 'sortOrder'])
    const protectedFields = [
      'organization_id', 'installation_id', 'store_id', 'product_id', 'image_url', 'id',
      'organizationId', 'installationId', 'storeId', 'productId', 'imageUrl', 'imageId',
    ]
    if (
      Object.keys(input).length === 0 ||
      Object.keys(input).some((field) => !allowedFields.has(field)) ||
      protectedFields.some((field) => field in input)
    ) {
      return Response.json({ error: 'Only isPrimary and sortOrder may be updated.' }, { status: 400 })
    }

    const isPrimary = input.isPrimary
    const sortOrder = input.sortOrder
    if (
      (isPrimary !== undefined && typeof isPrimary !== 'boolean') ||
      sortOrder !== undefined &&
      sortOrder !== null &&
      (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0)
    ) {
      return Response.json({ error: 'Invalid product image metadata.' }, { status: 400 })
    }

    const imageInput: UpdateProductImageInput = {
      isPrimary: isPrimary as boolean | undefined,
      sortOrder: sortOrder as number | undefined,
    }
    return Response.json(await updateProductImage(context, id, imageId, imageInput))
  } catch (error) {
    if (
      error instanceof ProductImagesProductNotFoundError ||
      error instanceof ProductImageNotFoundError
    ) {
      return Response.json({ error: 'Product image not found.' }, { status: 404 })
    }

    return Response.json({ error: 'Product image metadata is unavailable.' }, { status: 503 })
  }
}
