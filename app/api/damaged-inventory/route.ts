import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createDamagedInventory,
  DamagedInventoryNotFoundError,
  listDamagedInventory,
  type CreateDamagedInventoryInput,
} from '@/lib/repositories/damaged-inventory-repository'

function booleanParam(value: string | null) {
  if (value === null || value.trim() === '') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function unavailable(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : 'Damaged inventory is unavailable.' },
    { status: 503 }
  )
}

function optionalString(input: Record<string, unknown>, field: string) {
  const value = input[field]
  if (value === undefined || value === null) return null
  return typeof value === 'string' ? value.trim() || null : undefined
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const includeRestored = booleanParam(new URL(request.url).searchParams.get('includeRestored'))

    if (includeRestored === null) {
      return Response.json({ error: 'includeRestored must be true or false.' }, { status: 400 })
    }

    return Response.json(await listDamagedInventory(context, { includeRestored }))
  } catch (error) { return unavailable(error) }
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
      'organization_id', 'installation_id', 'store_id',
      'organizationId', 'installationId', 'storeId',
    ]
    if (protectedFields.some((field) => field in input)) {
      return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    }

    const productId = optionalString(input, 'productId')
    const quantity = input.quantity
    const status = optionalString(input, 'status')
    const originalStock = input.originalStock
    const stringFields = ['reason', 'reasonOther', 'notes', 'imei', 'saleItemId', 'creditNoteId', 'saleId', 'exchangeId']

    if (
      !productId ||
      typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 ||
      status === undefined ||
      (originalStock !== undefined && (typeof originalStock !== 'number' || !Number.isFinite(originalStock))) ||
      stringFields.some((field) => optionalString(input, field) === undefined)
    ) {
      return Response.json({ error: 'Invalid damaged inventory input.' }, { status: 400 })
    }

    const damagedInput: CreateDamagedInventoryInput = {
      productId,
      quantity,
      status: status ?? undefined,
      reason: optionalString(input, 'reason'),
      reasonOther: optionalString(input, 'reasonOther'),
      notes: optionalString(input, 'notes'),
      imei: optionalString(input, 'imei'),
      originalStock: originalStock ?? null,
      saleItemId: optionalString(input, 'saleItemId'),
      creditNoteId: optionalString(input, 'creditNoteId'),
      saleId: optionalString(input, 'saleId'),
      exchangeId: optionalString(input, 'exchangeId'),
    }

    return Response.json(await createDamagedInventory(context, damagedInput), { status: 201 })
  } catch (error) {
    if (error instanceof DamagedInventoryNotFoundError) {
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    }

    return unavailable(error)
  }
}
