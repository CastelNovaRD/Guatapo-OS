import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createPurchase,
  listPurchases,
  type CreatePurchaseInput,
} from '@/lib/repositories/purchases-repository'

function failure(error: unknown) {
  console.error('[PURCHASES]', error)

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo procesar la compra.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const purchases = await listPurchases(context)

    return Response.json(purchases)
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }

    const input = body as Record<string, unknown>

    const protectedFields = [
      'organization_id',
      'installation_id',
      'store_id',
      'organizationId',
      'installationId',
      'storeId',
      'created_by',
      'createdBy',
      'userId',
    ]

    if (protectedFields.some((field) => field in input)) {
      return Response.json(
        { error: 'Tenant and user fields are server-managed.' },
        { status: 400 }
      )
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      return Response.json(
        { error: 'Purchase must contain at least one item.' },
        { status: 400 }
      )
    }

    const numericFields = ['subtotal', 'tax', 'total']

    for (const field of numericFields) {
      const value = input[field]

      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        return Response.json(
          { error: `Invalid numeric field: ${field}.` },
          { status: 400 }
        )
      }
    }

    for (const item of input.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return Response.json(
          { error: 'Invalid purchase item.' },
          { status: 400 }
        )
      }

      const row = item as Record<string, unknown>

      if (
        typeof row.productId !== 'string' ||
        !row.productId.trim() ||
        typeof row.quantity !== 'number' ||
        !Number.isFinite(row.quantity) ||
        row.quantity <= 0 ||
        typeof row.unitCost !== 'number' ||
        !Number.isFinite(row.unitCost) ||
        row.unitCost < 0 ||
        typeof row.total !== 'number' ||
        !Number.isFinite(row.total) ||
        row.total < 0 ||
        (
          row.tax !== undefined &&
          (
            typeof row.tax !== 'number' ||
            !Number.isFinite(row.tax) ||
            row.tax < 0
          )
        )
      ) {
        return Response.json(
          { error: 'Invalid purchase item.' },
          { status: 400 }
        )
      }
    }

    const purchase = await createPurchase(
      context,
      input as unknown as CreatePurchaseInput
    )

    return Response.json(purchase, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}