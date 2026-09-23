import { requireTenantContext } from '@/lib/auth/tenant-context'
import { deleteProduct, getProductById, setProductActive, updateProduct, type ProductInput } from '@/lib/repositories/products-repository'

function errorResponse(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 503 }) }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const product = await getProductById(await requireTenantContext(request), (await params).id); return product ? Response.json(product) : Response.json({ error: 'Not found' }, { status: 404 }) } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as Partial<ProductInput>
    const id = (await params).id
    if (typeof body.active === 'boolean' && Object.keys(body).length === 1) { const product = await setProductActive(await requireTenantContext(request), id, body.active); return product ? Response.json(product) : Response.json({ error: 'Not found' }, { status: 404 }) }
    if (!body.name?.trim()) return Response.json({ error: 'name is required for full update' }, { status: 400 })
    const product = await updateProduct(await requireTenantContext(request), id, body as ProductInput)
    return product ? Response.json(product) : Response.json({ error: 'Not found' }, { status: 404 })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireTenantContext(request)
    const id = (await params).id
    const result = await deleteProduct(context, id)

    if (result.status === 'not_found') {
      return Response.json({ error: 'Producto no encontrado.' }, { status: 404 })
    }

    if (result.status === 'has_history') {
      return Response.json(
        {
          error: 'Este producto tiene historial y no puede eliminarse. Puedes desactivarlo para conservar los registros.',
        },
        { status: 409 }
      )
    }

    return Response.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}