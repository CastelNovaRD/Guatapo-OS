import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  applyProductExchange,
  ProductExchangeValidationError,
  type ApplyProductExchangeInput,
} from '@/lib/repositories/product-exchanges-repository'

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const body = (await request.json()) as ApplyProductExchangeInput

    const result = await applyProductExchange(context, body)

    return Response.json(result, { status: 201 })
  } catch (error) {
    console.error('[PRODUCT EXCHANGE]', error)

    if (error instanceof ProductExchangeValidationError) {
      return Response.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo completar el cambio.',
      },
      { status: 500 }
    )
  }
}