import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createCashWithdrawal,
  listCashMovements,
} from '@/lib/repositories/cash-movements-repository'

function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Cash movements are unavailable.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams

    return Response.json(
      await listCashMovements(await requireTenantContext(request), {
        cashRegisterId: params.get('cashRegisterId')?.trim() || undefined,
        type: params.get('type')?.trim() || undefined,
      })
    )
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }

    const input = body as Record<string, unknown>

    const allowedFields = new Set([
      'cashRegisterId',
      'amount',
      'notes',
    ])

    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      return Response.json(
        { error: 'Invalid cash movement fields.' },
        { status: 400 }
      )
    }

    if (
      typeof input.cashRegisterId !== 'string' ||
      !input.cashRegisterId.trim()
    ) {
      return Response.json(
        { error: 'cashRegisterId is required.' },
        { status: 400 }
      )
    }

    if (
      typeof input.amount !== 'number' ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    ) {
      return Response.json(
        { error: 'amount must be greater than zero.' },
        { status: 400 }
      )
    }

    if (
      input.notes !== undefined &&
      input.notes !== null &&
      typeof input.notes !== 'string'
    ) {
      return Response.json(
        { error: 'notes must be text.' },
        { status: 400 }
      )
    }

    const movement = await createCashWithdrawal(context, {
      cashRegisterId: input.cashRegisterId.trim(),
      amount: input.amount,
      notes:
        typeof input.notes === 'string'
          ? input.notes
          : null,
    })

    return Response.json(movement, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}