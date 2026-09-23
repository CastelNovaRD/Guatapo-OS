import { requireTenantContext } from '@/lib/auth/tenant-context'
import { listCashRegisters, openCashRegister } from '@/lib/repositories/cash-registers-repository'

function cashRegisterError(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : 'Cash registers are unavailable.' },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status')
    if (status !== null && status !== 'open' && status !== 'closed') {
      return Response.json({ error: 'Invalid cash register status.' }, { status: 400 })
    }

    return Response.json(
      await listCashRegisters(await requireTenantContext(request), {
        status: status ?? undefined,
      })
    )
  } catch (error) {
    return cashRegisterError(error)
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    const protectedFields = ['organization_id', 'installation_id', 'store_id', 'organizationId', 'installationId', 'storeId']
    if (protectedFields.some((field) => field in input) || Object.keys(input).some((field) => field !== 'openingAmount')) {
      return Response.json({ error: 'Only openingAmount may be provided.' }, { status: 400 })
    }

    const openingAmount = input.openingAmount ?? 0
    if (typeof openingAmount !== 'number' || !Number.isFinite(openingAmount) || openingAmount < 0) {
      return Response.json({ error: 'openingAmount must be a non-negative number.' }, { status: 400 })
    }

    return Response.json(
      await openCashRegister(await requireTenantContext(request), openingAmount),
      { status: 201 }
    )
  } catch (error) {
    return cashRegisterError(error)
  }
}
