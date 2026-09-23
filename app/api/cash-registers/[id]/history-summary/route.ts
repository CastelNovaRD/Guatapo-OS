import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getCashRegisterSummary } from '@/lib/repositories/cash-registers-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id.trim()) {
      return Response.json({ error: 'Cash register ID is required.' }, { status: 400 })
    }

    const summary = await getCashRegisterSummary(
      await requireTenantContext(request),
      id
    )

    return summary
      ? Response.json(summary)
      : Response.json({ error: 'Cash register not found.' }, { status: 404 })
  } catch (error) {
    console.error('[CASH REGISTER HISTORY SUMMARY]', error)
    return Response.json(
      { error: 'Cash register summary is unavailable.' },
      { status: 503 }
    )
  }
}
