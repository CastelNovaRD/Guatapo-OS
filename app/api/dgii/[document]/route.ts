import { DatabaseNotConfiguredError } from '@/lib/db'
import { IdentityNotConfiguredError, requireTenantContext } from '@/lib/auth/tenant-context'
import { lookupDgiiContributor } from '@/lib/services/dgii-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: RouteContext<'/api/dgii/[document]'>) {
  try {
    const tenant = await requireTenantContext(request)
    const { document } = await context.params
    const contributor = await lookupDgiiContributor(tenant, document)

    if (!contributor) return Response.json({ status: 'not_found' }, { status: 404 })
    return Response.json({ status: 'found', contributor })
  } catch (error) {
    if (error instanceof IdentityNotConfiguredError) {
      return Response.json({ status: 'unavailable', reason: 'identity_not_configured' }, { status: 503 })
    }
    if (error instanceof DatabaseNotConfiguredError) {
      return Response.json({ status: 'unavailable', reason: 'database_not_configured' }, { status: 503 })
    }
    console.error('DGII lookup failed', error)
    return Response.json({ status: 'unavailable', reason: 'lookup_failed' }, { status: 503 })
  }
}

