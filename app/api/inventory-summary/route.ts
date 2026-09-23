import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getInventorySummary } from '@/lib/repositories/inventory-summary-repository'

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    return Response.json(await getInventorySummary(context))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Inventory summary is unavailable.' },
      { status: 503 }
    )
  }
}
