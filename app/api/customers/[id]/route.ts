import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  deleteCustomer,
  getCustomerById,
  setCustomerActive,
  updateCustomer,
  type CustomerDocumentType,
  type CustomerInput,
} from '@/lib/repositories/customers-repository'

const protectedFields = new Set([
  'id', 'organization_id', 'installation_id', 'store_id', 'created_at', 'updated_at',
  'organizationId', 'installationId', 'storeId', 'createdAt', 'updatedAt',
])
const customerFields = new Set([
  'fullName', 'full_name', 'document', 'cedula', 'documentType',
  'phone', 'address', 'email', 'active',
])

function validDocumentType(value: unknown): value is CustomerDocumentType | undefined {
  return value === undefined || value === null || value === 'cedula' || value === 'rnc'
}

function validText(value: unknown) {
  return value === undefined || value === null || typeof value === 'string'
}

function failure(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return Response.json({ error: 'Customer data conflicts with an existing record.' }, { status: 409 })
  }
  return Response.json({ error: 'Customers are unavailable.' }, { status: 503 })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Customer ID is required.' }, { status: 400 })

    const customer = await getCustomerById(context, id)
    return customer
      ? Response.json(customer)
      : Response.json({ error: 'Customer not found.' }, { status: 404 })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Customer ID is required.' }, { status: 400 })

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
    if (
      Object.keys(input).length === 0 ||
      Object.keys(input).some((field) => !customerFields.has(field)) ||
      [...protectedFields].some((field) => field in input) ||
      !validDocumentType(input.documentType) ||
      typeof input.active !== 'undefined' && typeof input.active !== 'boolean' ||
      ['fullName', 'full_name', 'document', 'cedula', 'phone', 'address', 'email']
        .some((field) => !validText(input[field]))
    ) {
      return Response.json({ error: 'Invalid customer update.' }, { status: 400 })
    }

    const customer = Object.keys(input).length === 1 && typeof input.active === 'boolean'
      ? await setCustomerActive(context, id, input.active)
      : await updateCustomer(context, id, input as CustomerInput)

    return customer
      ? Response.json(customer)
      : Response.json({ error: 'Customer not found.' }, { status: 404 })
  } catch (error) {
    return failure(error)
  }
}

// Preserves the existing customer deletion route while the UI remains unchanged.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Customer ID is required.' }, { status: 400 })

    return await deleteCustomer(context, id)
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'Customer not found.' }, { status: 404 })
  } catch (error) {
    return failure(error)
  }
}
