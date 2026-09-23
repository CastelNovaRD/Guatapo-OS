import { CatalogStoreNotFoundError, getPublicCatalog } from '@/lib/repositories/catalog-repository'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const store = params.get('store')?.trim()
    const search = params.get('search')?.trim()
    const category = params.get('category')?.trim()

    if (
      !store ||
      store.length > 120 ||
      (search && search.length > 100) ||
      (category && category.length > 120)
    ) {
      return Response.json({ error: 'A valid public store slug is required.' }, { status: 400 })
    }

    return Response.json(await getPublicCatalog(store, search || undefined, category || undefined))
  } catch (error) {
    if (error instanceof CatalogStoreNotFoundError) {
      return Response.json({ error: 'Catalog not found.' }, { status: 404 })
    }
    return Response.json({ error: 'Catalog is unavailable.' }, { status: 503 })
  }
}
