import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createProduct, listProducts, type ProductInput } from '@/lib/repositories/products-repository'

function numberParam(value: string | null) { if (value === null || value === '') return undefined; const number = Number(value); return Number.isFinite(number) ? number : null }
function booleanParam(value: string | null) { if (value === null) return undefined; if (value === 'true') return true; if (value === 'false') return false; return null }
function errorResponse(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 503 }) }

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams

    const active = booleanParam(params.get('active'))
    const stockMin = numberParam(params.get('stockMin'))
    const stockMax = numberParam(params.get('stockMax'))
    const limit = numberParam(params.get('limit'))
    const offset = numberParam(params.get('offset'))

    if (
      active === null ||
      stockMin === null ||
      stockMax === null ||
      limit === null ||
      offset === null
    ) {
      return Response.json(
        { error: 'Invalid filter.' },
        { status: 400 }
      )
    }

    return Response.json(
      await listProducts(await requireTenantContext(request), {
        search: params.get('search') || undefined,
        categoryId: params.get('categoryId') || undefined,
        productTypeId: params.get('productTypeId') || undefined,
        active,
        stockMin,
        stockMax,
        limit,
        offset,
      })
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProductInput
    if (!body.name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 })
    if ([body.cost, body.salePrice, body.stock, body.stockMin].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) return Response.json({ error: 'Invalid numeric field.' }, { status: 400 })
    return Response.json(await createProduct(await requireTenantContext(request), { ...body, name: body.name.trim() }), { status: 201 })
  } catch (error) { return errorResponse(error) }
}
