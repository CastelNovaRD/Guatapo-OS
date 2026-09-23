import 'server-only'

import { query } from '@/lib/db'

type StoreRow = {
  id: string
  organization_id: string
  installation_id: string
  slug: string
  name: string
  system_name: string | null
  whatsapp: string | null
  web_settings: unknown
}

type CatalogProductRow = {
  name: string
  sale_price: string | number
  short_description: string | null
  full_description: string | null
  stock: string | number
  category_name: string | null
  image_id: string | null
  image_url: string | null
}

export type CatalogProduct = {
  name: string
  salePrice: number
  shortDescription: string | null
  fullDescription: string | null
  category: string | null
  imageUrl: string | null
  availability: 'Agotado' | 'Últimas unidades' | 'Disponible'
}

export type PublicCatalog = {
  store: {
    name: string
    systemName: string | null
    logoUrl: string | null
    publicName: string | null
    primaryColor: string | null
    accentColor: string | null
    heroTitle: string | null
    heroSubtitle: string | null
    heroBannerUrl: string | null
    whatsapp: string | null
  }
  categories: string[]
  products: CatalogProduct[]
}

export class CatalogStoreNotFoundError extends Error {
  constructor() {
    super('Catalog store not found.')
    this.name = 'CatalogStoreNotFoundError'
  }
}

export type PublicCatalogImage = {
  imageUrl: string
}

export type PublicCatalogBrandingAsset = {
  organizationId: string
  installationId: string
  storeId: string
}

function availability(stock: number): CatalogProduct['availability'] {
  if (stock <= 0) return 'Agotado'
  if (stock <= 2) return 'Últimas unidades'
  return 'Disponible'
}

function configuredLogoUrl(webSettings: unknown) {
  if (!webSettings || typeof webSettings !== 'object' || Array.isArray(webSettings)) {
    return null
  }

  const logoUrl = (webSettings as Record<string, unknown>).logoUrl
  return typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null
}

function catalogBranding(webSettings: unknown) {
  if (!webSettings || typeof webSettings !== 'object' || Array.isArray(webSettings)) return {}
  const branding = (webSettings as Record<string, unknown>).catalogBranding
  return branding && typeof branding === 'object' && !Array.isArray(branding)
    ? branding as Record<string, unknown>
    : {}
}

function brandingText(branding: Record<string, unknown>, key: string) {
  const value = branding[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Resolves a public store slug to its server-side tenant scope and returns only
 * customer-safe catalog fields. Product IDs, costs and tenant identifiers never
 * cross this repository boundary.
 */
export async function getPublicCatalog(
  storeSlug: string,
  search?: string,
  category?: string
): Promise<PublicCatalog> {
  const storeResult = await query<StoreRow>(
    `select id, organization_id, installation_id, slug, name, system_name, whatsapp, web_settings
       from stores
      where slug = $1 and active = true
      limit 1`,
    [storeSlug]
  )
  const store = storeResult.rows[0]
  if (!store) throw new CatalogStoreNotFoundError()

  const values: unknown[] = [store.organization_id, store.installation_id, store.id]
  const filters = [
    'p.organization_id = $1',
    'p.installation_id = $2',
    'p.store_id = $3',
    'p.active = true',
    'p.show_on_website = true',
  ]
  if (search?.trim()) {
    values.push(`%${search.trim()}%`)
    filters.push(`p.name ilike $${values.length}`)
  }
  if (category?.trim()) {
    values.push(category.trim())
    filters.push(
      `exists (
        select 1
          from categories selected_category
         where selected_category.id = p.category_id
           and selected_category.organization_id = p.organization_id
           and selected_category.installation_id = p.installation_id
           and selected_category.store_id = p.store_id
           and selected_category.active = true
           and selected_category.name = $${values.length}
      )`
    )
  }

  const categories = await query<{ name: string }>(
    `select name
       from categories
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
        and active = true
      order by name asc`,
    [store.organization_id, store.installation_id, store.id]
  )

  const products = await query<CatalogProductRow>(
    `select p.name, p.sale_price, p.short_description, p.full_description, p.stock, category.name as category_name,
            image.id as image_id, image.image_url
       from products p
       left join categories category
         on category.id = p.category_id
        and category.organization_id = p.organization_id
        and category.installation_id = p.installation_id
        and category.store_id = p.store_id
       left join lateral (
         select pi.id, pi.image_url
           from product_images pi
          where pi.organization_id = p.organization_id
            and pi.installation_id = p.installation_id
            and pi.store_id = p.store_id
            and pi.product_id = p.id
          order by pi.is_primary desc, pi.sort_order asc, pi.id asc
          limit 1
       ) image on true
      where ${filters.join(' and ')}
      order by p.name asc
      limit 200`,
    values
  )

  return {
    store: {
      name: store.name,
      systemName: store.system_name,
      logoUrl: brandingText(catalogBranding(store.web_settings), 'logoUrl') || configuredLogoUrl(store.web_settings),
      publicName: brandingText(catalogBranding(store.web_settings), 'publicName'),
      primaryColor: brandingText(catalogBranding(store.web_settings), 'primaryColor'),
      accentColor: brandingText(catalogBranding(store.web_settings), 'accentColor'),
      heroTitle: brandingText(catalogBranding(store.web_settings), 'heroTitle'),
      heroSubtitle: brandingText(catalogBranding(store.web_settings), 'heroSubtitle'),
      heroBannerUrl: brandingText(catalogBranding(store.web_settings), 'heroBannerUrl'),
      whatsapp: brandingText(catalogBranding(store.web_settings), 'whatsapp') || store.whatsapp,
    },
    categories: categories.rows.map((category) => category.name),
    products: products.rows.map((product) => {
      const stock = Number(product.stock)
      return {
        name: product.name,
        salePrice: Number(product.sale_price),
        shortDescription: product.short_description,
        fullDescription: product.full_description,
        category: product.category_name,
        imageUrl: product.image_id
          ? `/api/public/product-images/${product.image_id}`
          : null,
        availability: availability(Number.isFinite(stock) ? stock : 0),
      }
    }),
  }
}

/**
 * Resolves a branding asset only when the requested URL exactly matches the
 * active store's configured catalog branding reference. This keeps storage
 * paths and tenant identifiers out of the public URL.
 */
export async function getPublicCatalogBrandingAsset(
  storeSlug: string,
  kind: 'logo' | 'banner',
  expectedUrl: string
): Promise<PublicCatalogBrandingAsset | null> {
  const result = await query<StoreRow>(
    `select id, organization_id, installation_id, slug, name, system_name, whatsapp, web_settings
       from stores
      where slug = $1 and active = true
      limit 1`,
    [storeSlug]
  )
  const store = result.rows[0]
  if (!store) return null

  const configured = brandingText(catalogBranding(store.web_settings), kind === 'logo' ? 'logoUrl' : 'heroBannerUrl')
  if (configured !== expectedUrl) return null
  return {
    organizationId: store.organization_id,
    installationId: store.installation_id,
    storeId: store.id,
  }
}

/**
 * Resolves only an image belonging to a currently public product. The route
 * that calls this function never exposes the storage path to the browser.
 */
export async function getPublicCatalogImage(imageId: string): Promise<PublicCatalogImage | null> {
  const result = await query<{ image_url: string }>(
    `select pi.image_url
       from product_images pi
       join products p
         on p.id = pi.product_id
        and p.organization_id = pi.organization_id
        and p.installation_id = pi.installation_id
        and p.store_id = pi.store_id
       join stores s
         on s.id = p.store_id
        and s.organization_id = p.organization_id
        and s.installation_id = p.installation_id
      where pi.id = $1
        and p.active = true
        and p.show_on_website = true
        and s.active = true
      limit 1`,
    [imageId]
  )

  const image = result.rows[0]
  return image ? { imageUrl: image.image_url } : null
}
