import { requireTenantContext } from '@/lib/auth/tenant-context'
import { listPaymentMethods } from '@/lib/repositories/payment-methods-repository'

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const methods = await listPaymentMethods(context)

    return Response.json(methods)
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Payment methods are unavailable.',
      },
      { status: 503 }
    )
  }
}