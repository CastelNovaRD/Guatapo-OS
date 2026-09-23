import 'server-only'

import type { QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type InventoryMovementFilters = {
  productId?: string
  movementType?: string
  limit?: number
  offset?: number
}

export type CreateInventoryMovementInput = {
  productId: string
  movementType: string
  quantity: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
}

type InventoryMovementRow = QueryResultRow & {
  id: string
  product_id: string
  type: string
  movement_type: string
  quantity: string | number
  previous_stock: string | number
  new_stock: string | number
  reference_type: string | null
  reference_id: string | null
  created_by: string | null
  created_at: string
  notes: string | null
}

type ProductStockRow = QueryResultRow & { stock: string | number }

export class InventoryProductNotFoundError extends Error {
  constructor() {
    super('Product not found in the current tenant.')
    this.name = 'InventoryProductNotFoundError'
  }
}

export class InsufficientInventoryError extends Error {
  constructor() {
    super('Inventory movement would make stock negative.')
    this.name = 'InsufficientInventoryError'
  }
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

/** Lists inventory movements that belong exclusively to the current tenant. */
export async function listInventoryMovements(
  context: TenantContext,
  filters: InventoryMovementFilters = {}
) {
  const values: unknown[] = [...scope(context)]
  const clauses = [
    'organization_id = $1',
    'installation_id = $2',
    'store_id = $3',
  ]

  if (filters.productId) {
    values.push(filters.productId)
    clauses.push(`product_id = $${values.length}`)
  }

  if (filters.movementType) {
    values.push(filters.movementType)
    clauses.push(`movement_type = $${values.length}`)
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  values.push(limit, offset)

  return (
    await query<InventoryMovementRow>(
      `select id, product_id, type, movement_type, quantity, previous_stock, new_stock,
              reference_type, reference_id, created_by, created_at, notes
         from inventory_movements
        where ${clauses.join(' and ')}
        order by created_at desc, id desc
        limit $${values.length - 1} offset $${values.length}`,
      values
    )
  ).rows
}

/**
 * Applies a stock delta and records its movement atomically. Quantities follow
 * the existing convention: positive values add stock and negative values remove it.
 */
export async function createInventoryMovement(
  context: TenantContext,
  input: CreateInventoryMovementInput
) {
  if (!input.productId || !input.movementType.trim()) {
    throw new Error('productId and movementType are required.')
  }

  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new Error('quantity must be a non-zero finite number.')
  }

  return withTransaction(async (client) => {
    const productResult = await client.query<ProductStockRow>(
      `select stock
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [input.productId, ...scope(context)]
    )
    const product = productResult.rows[0]

    if (!product) throw new InventoryProductNotFoundError()

    const previousStock = Number(product.stock)
    const newStock = previousStock + input.quantity

    if (newStock < 0) throw new InsufficientInventoryError()

    await client.query(
      `update products
          set stock = $1, updated_at = now()
        where id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5`,
      [newStock, input.productId, ...scope(context)]
    )

    const movement = await client.query<InventoryMovementRow>(
      `insert into inventory_movements (
         organization_id, installation_id, store_id, product_id,
         type, movement_type, quantity, previous_stock, new_stock,
         reference_type, reference_id, created_by, notes
       ) values (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12, $13
       )
       returning id, product_id, type, movement_type, quantity, previous_stock, new_stock,
                 reference_type, reference_id, created_by, created_at, notes`,
      [
        ...scope(context),
        input.productId,
        input.movementType,
        input.movementType,
        input.quantity,
        previousStock,
        newStock,
        input.referenceType ?? null,
        input.referenceId ?? null,
        context.userId,
        input.notes ?? null,
      ]
    )

    return movement.rows[0]
  })
}
