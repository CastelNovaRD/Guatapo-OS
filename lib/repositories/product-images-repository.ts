import 'server-only'

import type { QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

type ProductRow = QueryResultRow & { id: string }

export type ProductImage = QueryResultRow & {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

export type CreateProductImageInput = {
  imageUrl: string
  isPrimary?: boolean
  sortOrder?: number
}

export type UpdateProductImageInput = {
  isPrimary?: boolean
  sortOrder?: number
}

export class ProductImagesProductNotFoundError extends Error {
  constructor() {
    super('Product not found in the current tenant.')
    this.name = 'ProductImagesProductNotFoundError'
  }
}

export class ProductImageNotFoundError extends Error {
  constructor() {
    super('Product image not found in the current tenant.')
    this.name = 'ProductImageNotFoundError'
  }
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

export async function listProductImages(context: TenantContext, productId: string) {
  const product = await query<ProductRow>(
    `select id
       from products
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4`,
    [productId, ...scope(context)]
  )

  if (!product.rows[0]) throw new ProductImagesProductNotFoundError()

  return (
    await query<ProductImage>(
      `select id, product_id, image_url, is_primary, sort_order
         from product_images
        where product_id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        order by is_primary desc, sort_order asc, id asc`,
      [productId, ...scope(context)]
    )
  ).rows
}

export async function createProductImage(
  context: TenantContext,
  productId: string,
  input: CreateProductImageInput
) {
  return withTransaction(async (client) => {
    const product = await client.query<ProductRow>(
      `select id
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [productId, ...scope(context)]
    )

    if (!product.rows[0]) throw new ProductImagesProductNotFoundError()

    const isPrimary = input.isPrimary ?? false
    if (isPrimary) {
      await client.query(
        `update product_images
            set is_primary = false
          where product_id = $1
            and organization_id = $2
            and installation_id = $3
            and store_id = $4
            and is_primary = true`,
        [productId, ...scope(context)]
      )
    }

    const result = await client.query<ProductImage>(
      `insert into product_images (
         organization_id, installation_id, store_id, product_id,
         image_url, is_primary, sort_order
       ) values ($1, $2, $3, $4, $5, $6, $7)
       returning id, product_id, image_url, is_primary, sort_order`,
      [
        ...scope(context),
        productId,
        input.imageUrl,
        isPrimary,
        input.sortOrder ?? 0,
      ]
    )

    return result.rows[0]
  })
}

export async function deleteProductImage(
  context: TenantContext,
  productId: string,
  imageId: string
) {
  return withTransaction(async (client) => {
    const product = await client.query<ProductRow>(
      `select id
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [productId, ...scope(context)]
    )

    if (!product.rows[0]) throw new ProductImagesProductNotFoundError()

    const image = await client.query<ProductImage>(
      `delete from product_images
        where id = $1
          and product_id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5
        returning id, product_id, image_url, is_primary, sort_order`,
      [imageId, productId, ...scope(context)]
    )

    if (!image.rows[0]) throw new ProductImageNotFoundError()
    return image.rows[0]
  })
}

export async function updateProductImage(
  context: TenantContext,
  productId: string,
  imageId: string,
  input: UpdateProductImageInput
) {
  return withTransaction(async (client) => {
    const product = await client.query<ProductRow>(
      `select id
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [productId, ...scope(context)]
    )

    if (!product.rows[0]) throw new ProductImagesProductNotFoundError()

    const image = await client.query<ProductImage>(
      `select id, product_id, image_url, is_primary, sort_order
         from product_images
        where id = $1
          and product_id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5
        for update`,
      [imageId, productId, ...scope(context)]
    )
    if (!image.rows[0]) throw new ProductImageNotFoundError()

    if (input.isPrimary === true) {
      await client.query(
        `update product_images
            set is_primary = false
          where product_id = $1
            and organization_id = $2
            and installation_id = $3
            and store_id = $4
            and id <> $5
            and is_primary = true`,
        [productId, ...scope(context), imageId]
      )
    }

    const updated = await client.query<ProductImage>(
      `update product_images
          set is_primary = coalesce($1, is_primary),
              sort_order = coalesce($2, sort_order)
        where id = $3
          and product_id = $4
          and organization_id = $5
          and installation_id = $6
          and store_id = $7
        returning id, product_id, image_url, is_primary, sort_order`,
      [input.isPrimary ?? null, input.sortOrder ?? null, imageId, productId, ...scope(context)]
    )

    return updated.rows[0]
  })
}
