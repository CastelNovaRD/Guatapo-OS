import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createPosSale,
  PosSaleCreditNoteError,
  PosSaleNcfUnavailableError,
  PosSaleStockError,
  PosSaleValidationError,
  type CreatePosSaleInput,
} from '@/lib/repositories/pos-sales-repository'

function failure(error: unknown) {
  if (error instanceof PosSaleValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  if (error instanceof PosSaleStockError) {
    return Response.json({ error: error.message }, { status: 409 })
  }

  if (error instanceof PosSaleNcfUnavailableError) {
    return Response.json({ error: error.message }, { status: 409 })
  }

  if (error instanceof PosSaleCreditNoteError) {
    return Response.json({ error: error.message }, { status: 409 })
  }

  console.error('[POS SALE]', error)

  return Response.json(
    { error: 'No se pudo completar la venta.' },
    { status: 503 }
  )
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
        { error: 'Sale must contain at least one item.' },
        { status: 400 }
      )
    }

    const numericFields = [
      'subtotal',
      'discount',
      'tax',
      'total',
      'shippingCost',
      'cardFee',
      'netReceived',
      'cashReceived',
      'cashChange',
    ]

    for (const field of numericFields) {
      const value = input[field]

      if (
        value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value))
      ) {
        return Response.json(
          { error: `Invalid numeric field: ${field}.` },
          { status: 400 }
        )
      }
    }

    if (
      typeof input.total !== 'number' ||
      !Number.isFinite(input.total) ||
      input.total < 0
    ) {
      return Response.json(
        { error: 'Invalid sale total.' },
        { status: 400 }
      )
    }

    if (
      input.pendingPayment !== undefined &&
      typeof input.pendingPayment !== 'boolean'
    ) {
      return Response.json(
        { error: 'pendingPayment must be boolean.' },
        { status: 400 }
      )
    }

    const sale = await createPosSale(
      context,
      input as unknown as CreatePosSaleInput
    )

    return Response.json(sale, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}