import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  CashRegisterAlreadyClosedError,
  CashRegisterNotFoundError,
  closeCashRegister,
  getCashRegisterById,
} from '@/lib/repositories/cash-registers-repository'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Cash register ID is required.' }, { status: 400 })

    const register = await getCashRegisterById(await requireTenantContext(request), id)
    if (!register) return Response.json({ error: 'Cash register not found.' }, { status: 404 })
    return Response.json(register)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Cash register is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Cash register ID is required.' }, { status: 400 })

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
    if (protectedFields.some((field) => field in input) || Object.keys(input).length !== 1 || !('closingAmount' in input)) {
      return Response.json({ error: 'Only closingAmount may be provided.' }, { status: 400 })
    }
    if (typeof input.closingAmount !== 'number' || !Number.isFinite(input.closingAmount) || input.closingAmount < 0) {
      return Response.json({ error: 'closingAmount must be a non-negative number.' }, { status: 400 })
    }

    return Response.json(
      await closeCashRegister(await requireTenantContext(request), id, input.closingAmount)
    )
  } catch (error) {
    if (error instanceof CashRegisterNotFoundError) {
      return Response.json({ error: 'Cash register not found.' }, { status: 404 })
    }
    if (error instanceof CashRegisterAlreadyClosedError) {
      return Response.json({ error: 'Cash register is already closed.' }, { status: 409 })
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Cash register is unavailable.' }, { status: 503 })
  }
}
