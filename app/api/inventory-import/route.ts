import { requireTenantContext } from '@/lib/auth/tenant-context'
import { query, withTransaction } from '@/lib/db'

type ImportRow = {
  existingId?: string
  name: string
  sku?: string
  barcode?: string
  category: string
  stock: number
  existingStock?: number
  cost: number
  salePrice: number
  active: boolean | null
}

type ImportRequest = {
  rows: ImportRow[]
  stockTreatment: 'replace' | 'add'
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    const body = (await request.json()) as ImportRequest

    if (!body || !Array.isArray(body.rows)) {
      return Response.json(
        { error: 'Invalid import data.' },
        { status: 400 }
      )
    }

    if (
      body.stockTreatment !== 'replace' &&
      body.stockTreatment !== 'add'
    ) {
      return Response.json(
        { error: 'Invalid stock treatment.' },
        { status: 400 }
      )
    }

    let created = 0
    let updated = 0
    let errors = 0

    await withTransaction(async (client) => {
      for (const row of body.rows) {
        try {
          if (
            !row.name?.trim() ||
            !row.category?.trim() ||
            !Number.isFinite(row.stock) ||
            !Number.isFinite(row.cost) ||
            !Number.isFinite(row.salePrice)
          ) {
            errors += 1
            continue
          }

          const categoryResult = await client.query<{ id: string }>(
            `insert into categories (
               organization_id,
               installation_id,
               store_id,
               name,
               active
             )
             values ($1, $2, $3, $4, true)
             on conflict (store_id, name)
             do update set active = true
             returning id`,
            [
              context.organizationId,
              context.installationId,
              context.storeId,
              row.category.trim(),
            ]
          )

          const categoryId = categoryResult.rows[0].id

          if (row.existingId) {
            const productResult = await client.query<{
              id: string
              stock: number | string
            }>(
              `select id, stock
                 from products
                where id = $1
                  and organization_id = $2
                  and installation_id = $3
                  and store_id = $4
                for update`,
              [
                row.existingId,
                context.organizationId,
                context.installationId,
                context.storeId,
              ]
            )

            const product = productResult.rows[0]

            if (!product) {
              errors += 1
              continue
            }

            const previousStock = Number(product.stock)

            const finalStock =
              body.stockTreatment === 'add'
                ? previousStock + row.stock
                : row.stock

            await client.query(
              `update products
                  set category_id = $1,
                      name = $2,
                      sku = $3,
                      barcode = $4,
                      stock = $5,
                      cost = $6,
                      sale_price = $7,
                      active = coalesce($8, active),
                      updated_at = now()
                where id = $9
                  and organization_id = $10
                  and installation_id = $11
                  and store_id = $12`,
              [
                categoryId,
                row.name.trim(),
                row.sku || null,
                row.barcode || null,
                finalStock,
                row.cost,
                row.salePrice,
                row.active,
                row.existingId,
                context.organizationId,
                context.installationId,
                context.storeId,
              ]
            )

            const difference = finalStock - previousStock

            if (difference !== 0) {
              await client.query(
                `insert into inventory_movements (
                   organization_id,
                   installation_id,
                   store_id,
                   product_id,
                   type,
                   movement_type,
                   quantity,
                   previous_stock,
                   new_stock,
                   reference_type,
                   created_by,
                   notes
                 )
                 values (
                   $1,$2,$3,$4,
                   'adjustment',
                   'adjustment',
                   $5,$6,$7,
                   'inventory_import',
                   $8,$9
                 )`,
                [
                  context.organizationId,
                  context.installationId,
                  context.storeId,
                  row.existingId,
                  difference,
                  previousStock,
                  finalStock,
                  context.userId,
                  body.stockTreatment === 'add'
                    ? 'Importación de inventario: suma de stock'
                    : 'Importación de inventario: reemplazo de stock',
                ]
              )
            }

            updated += 1
          } else {
            const productResult = await client.query<{ id: string }>(
              `insert into products (
                 organization_id,
                 installation_id,
                 store_id,
                 category_id,
                 name,
                 sku,
                 barcode,
                 stock,
                 cost,
                 sale_price,
                 active,
                 show_on_website,
                 featured,
                 web_visibility
               )
               values (
                 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                 true,true,false,'normal'
               )
               returning id`,
              [
                context.organizationId,
                context.installationId,
                context.storeId,
                categoryId,
                row.name.trim(),
                row.sku || null,
                row.barcode || null,
                row.stock,
                row.cost,
                row.salePrice,
              ]
            )

            const productId = productResult.rows[0].id

            if (row.stock > 0) {
              await client.query(
                `insert into inventory_movements (
                   organization_id,
                   installation_id,
                   store_id,
                   product_id,
                   type,
                   movement_type,
                   quantity,
                   previous_stock,
                   new_stock,
                   reference_type,
                   created_by,
                   notes
                 )
                 values (
                   $1,$2,$3,$4,
                   'initial_stock',
                   'initial_stock',
                   $5,0,$5,
                   'inventory_import',
                   $6,
                   'Importación de inventario: stock inicial'
                 )`,
                [
                  context.organizationId,
                  context.installationId,
                  context.storeId,
                  productId,
                  row.stock,
                  context.userId,
                ]
              )
            }

            created += 1
          }
        } catch (error) {
          console.error('[Inventory Import] Row error:', error)
          errors += 1
        }
      }
    })

    return Response.json({
      created,
      updated,
      errors,
    })
  } catch (error) {
    console.error('[Inventory Import] Error:', error)

    return Response.json(
      { error: 'Inventory import could not be completed.' },
      { status: 503 }
    )
  }
}