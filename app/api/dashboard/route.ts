import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getDashboardData } from '@/lib/repositories/dashboard-repository'

function dashboardError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Dashboard data is unavailable.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const data = await getDashboardData(context)

    return Response.json(data)
  } catch (error) {
    return dashboardError(error)
  }
}
