import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createSupplier,
  listSuppliers,
  type CreateSupplierInput,
} from '@/lib/repositories/purchases-repository'

function failure(error: unknown) {
  console.error('[SUPPLIERS]', error)

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el suplidor.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const suppliers = await listSuppliers(context)

    return Response.json(suppliers)
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

    const protectedFields = [
      'organization_id',
      'installation_id',
      'store_id',
      'organizationId',
      'installationId',
      'storeId',
      'created_by',
      'createdBy',
      'userId',
    ]

    if (protectedFields.some((field) => field in input)) {
      return Response.json(
        { error: 'Tenant and user fields are server-managed.' },
        { status: 400 }
      )
    }

    const allowedFields = new Set([
      'name',
      'rnc',
      'phone',
      'email',
      'address',
    ])

    if (Object.keys(input).some((field) => !allowedFields.has(field))) {
      return Response.json(
        { error: 'Invalid supplier field.' },
        { status: 400 }
      )
    }

    if (typeof input.name !== 'string' || !input.name.trim()) {
      return Response.json(
        { error: 'Supplier name is required.' },
        { status: 400 }
      )
    }

    const optionalFields = ['rnc', 'phone', 'email', 'address']

    for (const field of optionalFields) {
      const value = input[field]

      if (
        value !== undefined &&
        value !== null &&
        typeof value !== 'string'
      ) {
        return Response.json(
          { error: `Invalid supplier field: ${field}.` },
          { status: 400 }
        )
      }
    }

    const supplier = await createSupplier(
      context,
      input as unknown as CreateSupplierInput
    )

    return Response.json(supplier, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}