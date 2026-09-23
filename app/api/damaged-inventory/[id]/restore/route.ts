import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  DamagedInventoryNotFoundError,
  DamagedInventoryRestoreError,
  restoreDamagedInventory,
} from '@/lib/repositories/damaged-inventory-repository'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      'organization_id', 'installation_id', 'store_id', 'created_by',
      'organizationId', 'installationId', 'storeId',
    ]
    if (protectedFields.some((field) => field in input)) {
      return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    }

    const quantity = input.quantity
    const notes = input.notes
    if (
      typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 ||
      (notes !== undefined && notes !== null && typeof notes !== 'string')
    ) {
      return Response.json({ error: 'quantity must be a positive finite number.' }, { status: 400 })
    }

    return Response.json(
      await restoreDamagedInventory(context, (await params).id, {
        quantity,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
      })
    )
  } catch (error) {
    if (error instanceof DamagedInventoryNotFoundError) {
      return Response.json({ error: 'Damaged inventory record not found.' }, { status: 404 })
    }

    if (error instanceof DamagedInventoryRestoreError) {
      return Response.json({ error: error.message }, { status: 409 })
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Damaged inventory is unavailable.' },
      { status: 503 }
    )
  }
}
