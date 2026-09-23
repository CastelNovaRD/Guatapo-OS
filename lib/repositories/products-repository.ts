import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type ProductFilters = { search?: string; categoryId?: string; productTypeId?: string; active?: boolean; stockMin?: number; stockMax?: number; limit?: number; offset?: number }
export type ProductInput = { categoryId?: string | null; productTypeId?: string | null; name: string; sku?: string | null; barcode?: string | null; cost?: number; salePrice?: number; stock?: number; active?: boolean; specs?: Record<string, unknown>; stockMin?: number; showOnWebsite?: boolean; featured?: boolean; shortDescription?: string | null; slug?: string | null; fullDescription?: string | null; webVisibility?: string | null }
const scope = (context: TenantContext) => [context.organizationId, context.installationId, context.storeId]
const select = `select p.id,p.store_id,p.category_id,p.product_type_id,p.name,p.sku,p.barcode,p.cost,p.sale_price,p.stock,p.active,p.specs,p.created_at,p.updated_at,p.stock_min,p.show_on_website,p.featured,p.short_description,p.slug,p.full_description,p.web_visibility,c.name as category_name,pt.value as product_type_value,pt.label as product_type_label,pi.id as product_image_id,case when pi.image_url like '/product-images/%' then '/api/public/product-images/' || pi.id::text else pi.image_url end as image_url`
const from = `from products p
left join categories c
  on c.id=p.category_id
 and c.organization_id=p.organization_id
 and c.installation_id=p.installation_id
 and c.store_id=p.store_id
left join product_types pt
  on pt.id=p.product_type_id
 and pt.organization_id=p.organization_id
 and pt.installation_id=p.installation_id
 and pt.store_id=p.store_id
left join lateral (
  select id, image_url
  from product_images
  where organization_id=p.organization_id
    and installation_id=p.installation_id
    and store_id=p.store_id
    and product_id=p.id
  order by is_primary desc, sort_order asc, id asc
  limit 1
) pi on true`

export async function listProducts(context: TenantContext, filters: ProductFilters = {}) {
  const values: unknown[] = [...scope(context)]; const clauses = ['p.organization_id=$1', 'p.installation_id=$2', 'p.store_id=$3']
  if (filters.search?.trim()) { values.push(`%${filters.search.trim()}%`); clauses.push(`(p.name ilike $${values.length} or p.sku ilike $${values.length} or p.barcode ilike $${values.length})`) }
  if (filters.categoryId) { values.push(filters.categoryId); clauses.push(`p.category_id=$${values.length}`) }
  if (filters.productTypeId) { values.push(filters.productTypeId); clauses.push(`p.product_type_id=$${values.length}`) }
  if (filters.active !== undefined) { values.push(filters.active); clauses.push(`p.active=$${values.length}`) }
  if (filters.stockMin !== undefined) { values.push(filters.stockMin); clauses.push(`p.stock>=$${values.length}`) }
  if (filters.stockMax !== undefined) { values.push(filters.stockMax); clauses.push(`p.stock<=$${values.length}`) }
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200); const offset = Math.max(filters.offset ?? 0, 0)
  values.push(limit, offset)
  return (await query(`${select} ${from} where ${clauses.join(' and ')} order by p.created_at desc limit $${values.length - 1} offset $${values.length}`, values)).rows
}

export async function getProductById(context: TenantContext, id: string) { return (await query(`${select} ${from} where p.id=$1 and p.organization_id=$2 and p.installation_id=$3 and p.store_id=$4`, [id, ...scope(context)])).rows[0] || null }

export async function createProduct(context: TenantContext, input: ProductInput) {
  const value = { cost: 0, salePrice: 0, stock: 0, active: true, specs: {}, stockMin: 0, showOnWebsite: false, featured: false, ...input }
  return (await query(`insert into products (organization_id,installation_id,store_id,category_id,product_type_id,name,sku,barcode,cost,sale_price,stock,active,specs,stock_min,show_on_website,featured,short_description,slug,full_description,web_visibility) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`, [...scope(context),value.categoryId||null,value.productTypeId||null,value.name,value.sku||null,value.barcode||null,value.cost,value.salePrice,value.stock,value.active,JSON.stringify(value.specs),value.stockMin,value.showOnWebsite,value.featured,value.shortDescription||null,value.slug||null,value.fullDescription||null,value.webVisibility||null])).rows[0]
}

export async function updateProduct(context: TenantContext, id: string, input: ProductInput) {
  const columns: [string, unknown][] = [['category_id',input.categoryId||null],['product_type_id',input.productTypeId||null],['name',input.name],['sku',input.sku||null],['barcode',input.barcode||null],['cost',input.cost],['sale_price',input.salePrice],['stock',input.stock],['active',input.active],['specs',JSON.stringify(input.specs||{})],['stock_min',input.stockMin ?? 0],['show_on_website',input.showOnWebsite],['featured',input.featured],['short_description',input.shortDescription||null],['slug',input.slug||null],['full_description',input.fullDescription||null],['web_visibility',input.webVisibility||null]]
  const values = columns.map(([, value]) => value); const set = columns.map(([column], index) => `${column}=$${index + 1}`).join(', ')
  values.push(id, ...scope(context)); return (await query(`update products set ${set},updated_at=now() where id=$18 and organization_id=$19 and installation_id=$20 and store_id=$21 returning id`, values)).rows[0] || null
}

export async function setProductActive(context: TenantContext, id: string, active: boolean) { return (await query(`update products set active=$1,updated_at=now() where id=$2 and organization_id=$3 and installation_id=$4 and store_id=$5 returning id`, [active,id,...scope(context)])).rows[0] || null }


export async function deleteProduct(context: TenantContext, id: string) {
  const product = await query(
    `select id
       from products
      where id=$1
        and organization_id=$2
        and installation_id=$3
        and store_id=$4`,
    [id, ...scope(context)]
  )

  if (product.rows.length === 0) {
    return { status: 'not_found' as const }
  }

  const references = await query<{ has_history: boolean }>(
    `select (
       exists(select 1 from sale_items where product_id=$1)
       or exists(select 1 from purchase_items where product_id=$1)
       or exists(select 1 from credit_note_items where product_id=$1)
       or exists(select 1 from inventory_movements where product_id=$1)
       or exists(select 1 from damaged_inventory where product_id=$1)
       or exists(select 1 from product_returns where product_id=$1)
     ) as has_history`,
    [id]
  )

  if (references.rows[0]?.has_history) {
    return { status: 'has_history' as const }
  }

  await query(
    `delete from products
      where id=$1
        and organization_id=$2
        and installation_id=$3
        and store_id=$4`,
    [id, ...scope(context)]
  )

  return { status: 'deleted' as const }
}