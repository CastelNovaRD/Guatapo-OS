import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

type SupplierRow = QueryResultRow & {
  id: string
  name: string
  rnc: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
}

type PurchaseRow = QueryResultRow & {
  id: string
  supplier_id: string | null
  invoice_number: string | null
  status: string
  subtotal: string | number
  tax: string | number
  total: string | number
  received_at: Date | string | null
  created_at: Date | string
  supplier_name?: string | null
}

type PurchaseItemRow = QueryResultRow & {
  id: string
  purchase_id: string
  product_id: string
  quantity: string | number
  unit_cost: string | number
  tax: string | number
  total: string | number
}

type ProductStockRow = QueryResultRow & {
  id: string
  stock: string | number
  cost: string | number
}

export type CreateSupplierInput = {
  name: string
  rnc?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export type CreatePurchaseItemInput = {
  productId: string
  quantity: number
  unitCost: number
  tax?: number
  total: number
}

export type CreatePurchaseInput = {
  supplierId?: string | null
  invoiceNumber?: string | null
  subtotal: number
  tax: number
  total: number
  items: CreatePurchaseItemInput[]
}

function scope(context: TenantContext) {
  return [
    context.organizationId,
    context.installationId,
    context.storeId,
  ]
}

function numeric(value: string | number | null | undefined) {
  return Number(value || 0)
}

function mapSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    rnc: row.rnc,
    phone: row.phone,
    email: row.email,
    address: row.address,
    active: row.active,
  }
}

function mapPurchase(row: PurchaseRow) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || null,
    invoice_number: row.invoice_number,
    status: row.status,
    subtotal: numeric(row.subtotal),
    tax: numeric(row.tax),
    total: numeric(row.total),
    received_at: row.received_at,
    created_at: row.created_at,
  }
}

export async function listSuppliers(context: TenantContext) {
  const result = await query<SupplierRow>(
    `select
       id,
       name,
       rnc,
       phone,
       email,
       address,
       active
     from suppliers
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and active = true
     order by name asc`,
    scope(context)
  )

  return result.rows.map(mapSupplier)
}

export async function createSupplier(
  context: TenantContext,
  input: CreateSupplierInput
) {
  const name = input.name.trim()

  if (!name) {
    throw new Error('Supplier name is required.')
  }

  const result = await query<SupplierRow>(
    `insert into suppliers (
       organization_id,
       installation_id,
       store_id,
       name,
       rnc,
       phone,
       email,
       address,
       active
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, true)
     returning id, name, rnc, phone, email, address, active`,
    [
      ...scope(context),
      name,
      input.rnc?.trim() || null,
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.address?.trim() || null,
    ]
  )

  return mapSupplier(result.rows[0])
}

export async function listPurchases(context: TenantContext) {
  const result = await query<PurchaseRow>(
    `select
       p.id,
       p.supplier_id,
       p.invoice_number,
       p.status,
       p.subtotal,
       p.tax,
       p.total,
       p.received_at,
       p.created_at,
       s.name as supplier_name
     from purchases p
     left join suppliers s
       on s.id = p.supplier_id
      and s.organization_id = p.organization_id
      and s.installation_id = p.installation_id
      and s.store_id = p.store_id
     where p.organization_id = $1
       and p.installation_id = $2
       and p.store_id = $3
     order by p.created_at desc`,
    scope(context)
  )

  return result.rows.map(mapPurchase)
}

export async function getPurchaseItems(
  context: TenantContext,
  purchaseId: string
) {
  const result = await query<PurchaseItemRow>(
    `select
       pi.id,
       pi.purchase_id,
       pi.product_id,
       pi.quantity,
       pi.unit_cost,
       pi.tax,
       pi.total
     from purchase_items pi
     inner join purchases p on p.id = pi.purchase_id
     where pi.purchase_id = $1
       and p.organization_id = $2
       and p.installation_id = $3
       and p.store_id = $4
     order by pi.id asc`,
    [purchaseId, ...scope(context)]
  )

  return result.rows.map((row) => ({
    id: row.id,
    purchase_id: row.purchase_id,
    product_id: row.product_id,
    quantity: numeric(row.quantity),
    unit_cost: numeric(row.unit_cost),
    tax: numeric(row.tax),
    total: numeric(row.total),
  }))
}

export async function createPurchase(
  context: TenantContext,
  input: CreatePurchaseInput
) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Purchase must contain at least one item.')
  }

  return withTransaction(async (client) => {
    if (input.supplierId) {
      const supplier = await client.query(
        `select id
         from suppliers
         where id = $1
           and organization_id = $2
           and installation_id = $3
           and store_id = $4
           and active = true`,
        [input.supplierId, ...scope(context)]
      )

      if (!supplier.rows[0]) {
        throw new Error('Supplier not found.')
      }
    }

    const purchaseResult = await client.query<{ id: string }>(
      `insert into purchases (
         organization_id,
         installation_id,
         store_id,
         supplier_id,
         invoice_number,
         status,
         subtotal,
         tax,
         total,
         created_by
       )
       values ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9)
       returning id`,
      [
        ...scope(context),
        input.supplierId || null,
        input.invoiceNumber?.trim() || null,
        input.subtotal,
        input.tax,
        input.total,
        context.userId,
      ]
    )

    const purchaseId = purchaseResult.rows[0].id

    for (const item of input.items) {
      if (
        !item.productId ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.unitCost) ||
        item.unitCost < 0 ||
        !Number.isFinite(item.total) ||
        item.total < 0
      ) {
        throw new Error('Invalid purchase item.')
      }

      const product = await client.query(
        `select id
         from products
         where id = $1
           and organization_id = $2
           and installation_id = $3
           and store_id = $4`,
        [item.productId, ...scope(context)]
      )

      if (!product.rows[0]) {
        throw new Error('Product not found.')
      }

      await client.query(
        `insert into purchase_items (
           purchase_id,
           product_id,
           quantity,
           unit_cost,
           tax,
           total
         )
         values ($1, $2, $3, $4, $5, $6)`,
        [
          purchaseId,
          item.productId,
          item.quantity,
          item.unitCost,
          Number(item.tax || 0),
          item.total,
        ]
      )
    }

    return { id: purchaseId }
  })
}

async function receiveItem(
  client: PoolClient,
  context: TenantContext,
  purchaseId: string,
  item: PurchaseItemRow
) {
  const productResult = await client.query<ProductStockRow>(
    `select id, stock, cost
     from products
     where id = $1
       and organization_id = $2
       and installation_id = $3
       and store_id = $4
     for update`,
    [item.product_id, ...scope(context)]
  )

  const product = productResult.rows[0]

  if (!product) {
    throw new Error('Product not found while receiving purchase.')
  }

  const previousStock = numeric(product.stock)
  const previousCost = numeric(product.cost)
  const receivedQuantity = numeric(item.quantity)
  const receivedCost = numeric(item.unit_cost)

  if (receivedQuantity <= 0) {
    throw new Error('Invalid received quantity.')
  }

  const newStock = previousStock + receivedQuantity

  const newCost =
    newStock > 0
      ? (
          previousStock * previousCost +
          receivedQuantity * receivedCost
        ) / newStock
      : receivedCost

  await client.query(
    `update products
     set stock = $1,
         cost = $2,
         updated_at = now()
     where id = $3
       and organization_id = $4
       and installation_id = $5
       and store_id = $6`,
    [
      newStock,
      newCost,
      product.id,
      ...scope(context),
    ]
  )

  await client.query(
    `insert into inventory_movements (
       organization_id,
       installation_id,
       store_id,
       product_id,
       type,
       quantity,
       reference_type,
       reference_id,
       created_by,
       previous_stock,
       new_stock,
       notes,
       movement_type
     )
     values (
       $1, $2, $3, $4,
       'purchase',
       $5,
       'purchase',
       $6,
       $7,
       $8,
       $9,
       $10,
       'purchase'
     )`,
    [
      ...scope(context),
      product.id,
      receivedQuantity,
      purchaseId,
      context.userId,
      previousStock,
      newStock,
      `Recepción de compra ${purchaseId}`,
    ]
  )
}

export async function receivePurchase(
  context: TenantContext,
  purchaseId: string
) {
  return withTransaction(async (client) => {
    const purchaseResult = await client.query<PurchaseRow>(
      `select
         id,
         supplier_id,
         invoice_number,
         status,
         subtotal,
         tax,
         total,
         received_at,
         created_at
       from purchases
       where id = $1
         and organization_id = $2
         and installation_id = $3
         and store_id = $4
       for update`,
      [purchaseId, ...scope(context)]
    )

    const purchase = purchaseResult.rows[0]

    if (!purchase) {
      throw new Error('Purchase not found.')
    }

    if (purchase.status === 'received') {
      throw new Error('Purchase has already been received.')
    }

    if (purchase.status === 'cancelled') {
      throw new Error('Cancelled purchase cannot be received.')
    }

    const itemsResult = await client.query<PurchaseItemRow>(
      `select
         id,
         purchase_id,
         product_id,
         quantity,
         unit_cost,
         tax,
         total
       from purchase_items
       where purchase_id = $1
       order by id asc
       for update`,
      [purchaseId]
    )

    if (itemsResult.rows.length === 0) {
      throw new Error('Purchase has no items.')
    }

    for (const item of itemsResult.rows) {
      await receiveItem(
        client,
        context,
        purchaseId,
        item
      )
    }

    await client.query(
      `update purchases
       set status = 'received',
           received_at = now()
       where id = $1
         and organization_id = $2
         and installation_id = $3
         and store_id = $4`,
      [purchaseId, ...scope(context)]
    )

    return { id: purchaseId, status: 'received' as const }
  })
}