import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createInventoryMovement,
  InsufficientInventoryError,
  InventoryProductNotFoundError,
  listInventoryMovements,
  type CreateInventoryMovementInput,
} from '@/lib/repositories/inventory-movements-repository'

function integerParam(value: string | null, minimum: number) {
  if (value === null || value.trim() === '') return undefined

  const number = Number(value)
  return Number.isInteger(number) && number >= minimum ? number : null
}

function unavailable(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : 'Inventory movements are unavailable.' },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    const limit = integerParam(params.get('limit'), 1)
    const offset = integerParam(params.get('offset'), 0)

    if (limit === null || offset === null) {
      return Response.json({ error: 'limit and offset must be valid integers.' }, { status: 400 })
    }

    const productId = params.get('productId')?.trim() || undefined
    const movementType = params.get('movementType')?.trim() || undefined

    return Response.json(
      await listInventoryMovements(context, { productId, movementType, limit, offset })
    )
  } catch (error) {
    return unavailable(error)
  }
}

export async function POST(request: Request) {
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
      'organization_id',
      'installation_id',
      'store_id',
      'created_by',
      'previous_stock',
      'new_stock',
    ]

    if (protectedFields.some((field) => field in input)) {
      return Response.json({ error: 'Tenant and stock audit fields are server-managed.' }, { status: 400 })
    }

    const productId = typeof input.productId === 'string' ? input.productId.trim() : ''
    const movementType = typeof input.movementType === 'string' ? input.movementType.trim() : ''
    const quantity = input.quantity

    if (!productId || !movementType || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity === 0) {
      return Response.json(
        { error: 'productId, movementType and a non-zero finite quantity are required.' },
        { status: 400 }
      )
    }

    if (
      (input.notes !== undefined && input.notes !== null && typeof input.notes !== 'string') ||
      (input.referenceType !== undefined && input.referenceType !== null && typeof input.referenceType !== 'string') ||
      (input.referenceId !== undefined && input.referenceId !== null && typeof input.referenceId !== 'string')
    ) {
      return Response.json({ error: 'Invalid optional movement field.' }, { status: 400 })
    }

    const movementInput: CreateInventoryMovementInput = {
      productId,
      movementType,
      quantity,
      notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
      referenceType: typeof input.referenceType === 'string' ? input.referenceType.trim() || null : null,
      referenceId: typeof input.referenceId === 'string' ? input.referenceId.trim() || null : null,
    }

    return Response.json(await createInventoryMovement(context, movementInput), { status: 201 })
  } catch (error) {
    if (error instanceof InventoryProductNotFoundError) {
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    }

    if (error instanceof InsufficientInventoryError) {
      return Response.json({ error: error.message }, { status: 409 })
    }

    return unavailable(error)
  }
}
