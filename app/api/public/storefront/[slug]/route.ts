import { query } from '@/lib/db'

type StoreRow = {
  id: string
  organization_id: string
  installation_id: string
  name: string
  system_name: string | null
  web_settings: unknown
}

type StorefrontProduct = {
  id: string
  name: string
  sale_price: number
  stock: number
  category: string | null
  slug: string | null
  image_url: null
  short_description: string | null
  full_description: string | null
  specs: Record<string, string | null | undefined> | null
  featured: boolean
  created_at: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const storeSlug = slug.trim()
    if (!storeSlug) return Response.json({ error: 'Store slug is required.' }, { status: 400 })

    const store = await query<StoreRow>(
      `select id, organization_id, installation_id, name, system_name, web_settings
         from stores
        where slug = $1
          and active = true
        limit 1`,
      [storeSlug]
    )
    const currentStore = store.rows[0]
    if (!currentStore) return Response.json({ error: 'Store not found.' }, { status: 404 })

    const scope = [currentStore.organization_id, currentStore.installation_id, currentStore.id]
    const [categories, products, images] = await Promise.all([
      query(
        `select id, name from categories
          where organization_id = $1 and installation_id = $2 and store_id = $3 and active = true
          order by name asc`,
        scope
      ),
      query<StorefrontProduct>(
        `select p.id, p.name, p.sale_price, p.stock, c.name as category, p.slug,
                null::text as image_url, p.short_description, p.full_description,
                p.specs, p.featured, p.created_at
           from products p
           left join categories c
             on c.id = p.category_id
            and c.organization_id = p.organization_id
            and c.installation_id = p.installation_id
            and c.store_id = p.store_id
          where p.organization_id = $1 and p.installation_id = $2 and p.store_id = $3
            and p.active = true and p.show_on_website = true
          order by p.created_at desc`,
        scope
      ),
      query(
        `select id, product_id, image_url, is_primary, sort_order from product_images
          where organization_id = $1 and installation_id = $2 and store_id = $3
          order by is_primary desc, sort_order asc, id asc`,
        scope
      ),
    ])

    return Response.json({
      store: { id: currentStore.id, name: currentStore.name, system_name: currentStore.system_name },
      webSettings: currentStore.web_settings,
      categories: categories.rows,
      products: products.rows,
      productImages: images.rows,
    })
  } catch {
    return Response.json({ error: 'Storefront is unavailable.' }, { status: 503 })
  }
}
