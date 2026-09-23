import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createCustomer,
  listCustomers,
  type CustomerDocumentType,
  type CustomerInput,
} from '@/lib/repositories/customers-repository'

const tenantFields = [
  'organization_id', 'installation_id', 'store_id',
  'organizationId', 'installationId', 'storeId',
]
const customerFields = new Set([
  'fullName', 'full_name', 'document', 'cedula', 'documentType',
  'phone', 'address', 'email', 'active',
])

function booleanParam(value: string | null) {
  if (value === null || value.trim() === '') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function integerParam(value: string | null, minimum: number) {
  if (value === null || value.trim() === '') return undefined
  const number = Number(value)
  return Number.isInteger(number) && number >= minimum ? number : null
}

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

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    if (tenantFields.some((field) => params.has(field))) {
      return Response.json({ error: 'Tenant fields are server-managed.' }, { status: 400 })
    }

    const active = booleanParam(params.get('active'))
    const limit = integerParam(params.get('limit'), 1)
    const offset = integerParam(params.get('offset'), 0)
    if (active === null || limit === null || offset === null) {
      return Response.json({ error: 'Invalid customer filters.' }, { status: 400 })
    }

    return Response.json(await listCustomers(context, {
      search: params.get('search')?.trim() || undefined,
      active,
      limit,
      offset,
    }))
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
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    const name = input.fullName ?? input.full_name
    if (
      tenantFields.some((field) => field in input) ||
      Object.keys(input).some((field) => !customerFields.has(field)) ||
      typeof name !== 'string' || !name.trim() ||
      !validDocumentType(input.documentType) ||
      typeof input.active !== 'undefined' && typeof input.active !== 'boolean' ||
      ['document', 'cedula', 'phone', 'address', 'email'].some((field) => !validText(input[field]))
    ) {
      return Response.json({ error: 'Invalid customer input.' }, { status: 400 })
    }

    const customer = await createCustomer(context, input as CustomerInput)
    return Response.json(customer, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
