import { requireTenantContext } from '@/lib/auth/tenant-context'
import { receivePurchase } from '@/lib/repositories/purchases-repository'

function failure(error: unknown) {
  console.error('[PURCHASE RECEIVE]', error)

  const message =
    error instanceof Error
      ? error.message
      : 'No se pudo recibir la compra.'

  if (message === 'Purchase not found.') {
    return Response.json(
      { error: 'Compra no encontrada.' },
      { status: 404 }
    )
  }

  if (
    message === 'Purchase has already been received.' ||
    message === 'Cancelled purchase cannot be received.'
  ) {
    return Response.json(
      { error: message },
      { status: 409 }
    )
  }

  return Response.json(
    { error: message },
    { status: 503 }
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params

    if (!id?.trim()) {
      return Response.json(
        { error: 'Purchase ID is required.' },
        { status: 400 }
      )
    }

    const result = await receivePurchase(
      context,
      id.trim()
    )

    return Response.json(result)
  } catch (error) {
    return failure(error)
  }
}