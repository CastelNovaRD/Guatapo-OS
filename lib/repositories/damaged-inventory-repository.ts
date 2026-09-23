import 'server-only'

import type { QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type DamagedInventoryFilters = {
  includeRestored?: boolean
}

export type CreateDamagedInventoryInput = {
  productId: string
  quantity: number
  status?: string
  reason?: string | null
  reasonOther?: string | null
  notes?: string | null
  imei?: string | null
  originalStock?: number | null
  saleItemId?: string | null
  creditNoteId?: string | null
  saleId?: string | null
  exchangeId?: string | null
}

export type RestoreDamagedInventoryInput = {
  quantity: number
  notes?: string | null
}

export type DamagedInventoryRow = QueryResultRow & {
  id: string
  product_id: string
  sale_item_id: string | null
  credit_note_id: string | null
  sale_id: string | null
  exchange_id: string | null
  imei: string | null
  quantity: string | number
  status: string
  reason: string | null
  reason_other: string | null
  notes: string | null
  original_stock: string | number | null
  created_at: string
  product_name?: string
  product_sku?: string | null
}

type ProductStockRow = QueryResultRow & { id: string; stock: string | number }

export class DamagedInventoryNotFoundError extends Error {
  constructor() {
    super('Damaged inventory record not found in the current tenant.')
    this.name = 'DamagedInventoryNotFoundError'
  }
}

export class DamagedInventoryRestoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DamagedInventoryRestoreError'
  }
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const fields = `d.id, d.product_id, d.sale_item_id, d.credit_note_id, d.sale_id,
  d.exchange_id, d.imei, d.quantity, d.status, d.reason, d.reason_other,
  d.notes, d.original_stock, d.created_at`

export async function listDamagedInventory(
  context: TenantContext,
  filters: DamagedInventoryFilters = {}
) {
  const values: unknown[] = [...scope(context)]
  const clauses = [
    'd.organization_id = $1',
    'd.installation_id = $2',
    'd.store_id = $3',
  ]

  if (!filters.includeRestored) clauses.push("d.status <> 'restored'")

  return (
    await query<DamagedInventoryRow>(
      `select ${fields}, p.name as product_name, p.sku as product_sku
         from damaged_inventory d
         join products p
           on p.id = d.product_id
          and p.organization_id = d.organization_id
          and p.installation_id = d.installation_id
          and p.store_id = d.store_id
        where ${clauses.join(' and ')}
        order by d.created_at desc, d.id desc`,
      values
    )
  ).rows
}

export async function getDamagedInventoryById(context: TenantContext, id: string) {
  return (
    await query<DamagedInventoryRow>(
      `select ${fields}
         from damaged_inventory d
        where d.id = $1
          and d.organization_id = $2
          and d.installation_id = $3
          and d.store_id = $4`,
      [id, ...scope(context)]
    )
  ).rows[0] || null
}

export async function createDamagedInventory(
  context: TenantContext,
  input: CreateDamagedInventoryInput
) {
  if (!input.productId || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('productId and a positive finite quantity are required.')
  }

  return withTransaction(async (client) => {
    const product = await client.query<ProductStockRow>(
      `select id, stock
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [input.productId, ...scope(context)]
    )

    if (!product.rows[0]) throw new DamagedInventoryNotFoundError()

    const result = await client.query<DamagedInventoryRow>(
      `insert into damaged_inventory (
         organization_id, installation_id, store_id, product_id,
         sale_item_id, credit_note_id, sale_id, exchange_id, imei,
         quantity, status, reason, reason_other, notes, original_stock
       ) values (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15
       )
       returning ${fields.replaceAll('d.', '')}`,
      [
        ...scope(context),
        input.productId,
        input.saleItemId ?? null,
        input.creditNoteId ?? null,
        input.saleId ?? null,
        input.exchangeId ?? null,
        input.imei ?? null,
        input.quantity,
        input.status ?? 'pending_review',
        input.reason ?? null,
        input.reasonOther ?? null,
        input.notes ?? null,
        input.originalStock ?? Number(product.rows[0].stock),
      ]
    )

    return result.rows[0]
  })
}

export async function restoreDamagedInventory(
  context: TenantContext,
  id: string,
  input: RestoreDamagedInventoryInput
) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new DamagedInventoryRestoreError('quantity must be a positive finite number.')
  }

  return withTransaction(async (client) => {
    const damagedResult = await client.query<DamagedInventoryRow>(
      `select ${fields}
         from damaged_inventory d
        where d.id = $1
          and d.organization_id = $2
          and d.installation_id = $3
          and d.store_id = $4
        for update`,
      [id, ...scope(context)]
    )
    const damaged = damagedResult.rows[0]

    if (!damaged) throw new DamagedInventoryNotFoundError()
    if (damaged.status === 'restored') {
      throw new DamagedInventoryRestoreError('Damaged inventory has already been restored.')
    }

    const remainingQuantity = Number(damaged.quantity)
    if (input.quantity > remainingQuantity) {
      throw new DamagedInventoryRestoreError('Restore quantity exceeds damaged inventory quantity.')
    }

    const productResult = await client.query<ProductStockRow>(
      `select id, stock
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [damaged.product_id, ...scope(context)]
    )
    const product = productResult.rows[0]
    if (!product) throw new DamagedInventoryNotFoundError()

    const previousStock = Number(product.stock)
    const newStock = previousStock + input.quantity
    const newDamagedQuantity = remainingQuantity - input.quantity
    const status = newDamagedQuantity === 0 ? 'restored' : damaged.status

    await client.query(
      `update products
          set stock = $1, updated_at = now()
        where id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5`,
      [newStock, damaged.product_id, ...scope(context)]
    )

    const updated = await client.query<DamagedInventoryRow>(
      `update damaged_inventory
          set quantity = $1, status = $2
        where id = $3
          and organization_id = $4
          and installation_id = $5
          and store_id = $6
        returning ${fields.replaceAll('d.', '')}`,
      [newDamagedQuantity, status, id, ...scope(context)]
    )

    await client.query(
      `insert into inventory_movements (
         organization_id, installation_id, store_id, product_id,
         type, movement_type, quantity, previous_stock, new_stock,
         reference_type, reference_id, created_by, notes
       ) values (
         $1, $2, $3, $4,
         'damaged_restore', 'damaged_restore', $5, $6, $7,
         'damaged_inventory', $8, $9, $10
       )`,
      [
        ...scope(context),
        damaged.product_id,
        input.quantity,
        previousStock,
        newStock,
        id,
        context.userId,
        input.notes ?? null,
      ]
    )

    return updated.rows[0]
  })
}
