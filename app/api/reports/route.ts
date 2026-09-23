import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getReportsData } from '@/lib/repositories/reports-repository'

export async function GET(request: Request) {
  try {
    const data = await getReportsData(await requireTenantContext(request))
    return Response.json(data)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Reports are unavailable.' },
      { status: 503 }
    )
  }
}
