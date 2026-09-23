import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getDamagedInventoryById } from '@/lib/repositories/damaged-inventory-repository'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const damagedInventory = await getDamagedInventoryById(context, (await params).id)

    return damagedInventory
      ? Response.json(damagedInventory)
      : Response.json({ error: 'Damaged inventory record not found.' }, { status: 404 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Damaged inventory is unavailable.' },
      { status: 503 }
    )
  }
}
