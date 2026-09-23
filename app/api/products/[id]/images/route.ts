import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createProductImage,
  listProductImages,
  ProductImagesProductNotFoundError,
  type CreateProductImageInput,
} from '@/lib/repositories/product-images-repository'
import { resolveProductImageUrl } from '@/lib/product-images'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    const images = await listProductImages(context, id)

    return Response.json(
      images.map((image) => ({
        ...image,
        image_url: resolveProductImageUrl(image),
      }))
    )
  } catch (error) {
    if (error instanceof ProductImagesProductNotFoundError) {
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Product images are unavailable.' },
      { status: 503 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireTenantContext(request)
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
    const protectedFields = [
      'organization_id', 'installation_id', 'store_id',
      'organizationId', 'installationId', 'storeId',
    ]
    if (protectedFields.some((field) => field in input)) {
      return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    }

    const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : ''
    const isPrimary = input.isPrimary
    const sortOrder = input.sortOrder
    if (
      !imageUrl ||
      (isPrimary !== undefined && typeof isPrimary !== 'boolean') ||
      sortOrder !== undefined &&
      sortOrder !== null &&
      (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0)    ) {
      return Response.json({ error: 'Invalid product image metadata.' }, { status: 400 })
    }

    const imageInput: CreateProductImageInput = {
      imageUrl,
      isPrimary: isPrimary as boolean | undefined,
      sortOrder: sortOrder as number | undefined,
    }
    const image = await createProductImage(context, (await params).id, imageInput)

    return Response.json(image, { status: 201 })
  } catch (error) {
    if (error instanceof ProductImagesProductNotFoundError) {
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Product images are unavailable.' },
      { status: 503 }
    )
  }
}
