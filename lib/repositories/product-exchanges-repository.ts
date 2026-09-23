import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type ExchangeReturnedItemInput = {
  saleItemId: string
  restockQuantity: number
  damagedQuantity: number
}

export type ExchangeReplacementItemInput = {
  productId: string
  quantity: number
  discount: number
  imei?: string | null
}

export type ApplyProductExchangeInput = {
  saleId: string
  reason: string
  reasonOther?: string | null
  notes?: string | null
  returnedItems: ExchangeReturnedItemInput[]
  replacements: ExchangeReplacementItemInput[]
  paymentMethodId?: string | null
  cashReceived?: number
  extraCardFee?: number
}

type SaleRow = QueryResultRow & {
  id: string
  card_fee: string | number
  cash_received: string | number
  cash_change: string | number
  payment_method_id: string | null
}

type SaleItemRow = QueryResultRow & {
  id: string
  product_id: string | null
  product_name: string
  quantity: string | number
  unit_price: string | number
  cost: string | number
  discount: string | number
  total: string | number
  imei: string | null
}

type ProductRow = QueryResultRow & {
  id: string
  name: string
  sku: string | null
  stock: string | number
  sale_price: string | number
  cost: string | number
  product_type: string
}

type ExchangeRow = QueryResultRow & {
  id: string
  sale_id: string | null
  created_at: string
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const numeric = (value: unknown) => Number(value || 0)

export class ProductExchangeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductExchangeValidationError'
  }
}

async function lockProduct(
  client: PoolClient,
  context: TenantContext,
  productId: string
) {
  return (
    await client.query<ProductRow>(
      `select id, name, sku, stock, sale_price, cost, product_type
         from products
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
          and active = true
        for update`,
      [productId, ...scope(context)]
    )
  ).rows[0] || null
}

async function insertMovement(
  client: PoolClient,
  context: TenantContext,
  input: {
    productId: string
    movementType: string
    quantity: number
    previousStock: number
    newStock: number
    exchangeId: string
    notes?: string | null
  }
) {
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
       reference_id,
       created_by,
       notes
     ) values (
       $1,$2,$3,$4,
       $5,$5,$6,$7,$8,
       'exchange',$9,$10,$11
     )`,
    [
      ...scope(context),
      input.productId,
      input.movementType,
      input.quantity,
      input.previousStock,
      input.newStock,
      input.exchangeId,
      context.userId,
      input.notes ?? null,
    ]
  )
}

export async function applyProductExchange(
  context: TenantContext,
  input: ApplyProductExchangeInput
) {
  if (!input.saleId) {
    throw new ProductExchangeValidationError('saleId is required.')
  }

  if (!input.returnedItems.length && !input.replacements.length) {
    throw new ProductExchangeValidationError(
      'The exchange must contain returned or replacement items.'
    )
  }

  return withTransaction(async (client) => {
    const saleResult = await client.query<SaleRow>(
      `select id, card_fee, cash_received, cash_change, payment_method_id
         from sales
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [input.saleId, ...scope(context)]
    )

    const sale = saleResult.rows[0]

    if (!sale) {
      throw new ProductExchangeValidationError(
        'Sale not found in the current tenant.'
      )
    }

    const saleItemsResult = await client.query<SaleItemRow>(
      `select id, product_id, product_name, quantity, unit_price,
              cost, discount, total, imei
         from sale_items
        where sale_id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        for update`,
      [input.saleId, ...scope(context)]
    )

    const saleItems = new Map(
      saleItemsResult.rows.map((item) => [item.id, item])
    )

    const productIds = new Set<string>()

    for (const returned of input.returnedItems) {
      const item = saleItems.get(returned.saleItemId)

      if (!item) {
        throw new ProductExchangeValidationError(
          'One of the returned sale items was not found.'
        )
      }

      const restockQuantity = numeric(returned.restockQuantity)
      const damagedQuantity = numeric(returned.damagedQuantity)
      const returnedQuantity = restockQuantity + damagedQuantity

      if (
        restockQuantity < 0 ||
        damagedQuantity < 0 ||
        returnedQuantity <= 0 ||
        returnedQuantity > numeric(item.quantity)
      ) {
        throw new ProductExchangeValidationError(
          `Invalid returned quantity for ${item.product_name}.`
        )
      }

      if (item.product_id) productIds.add(item.product_id)
    }

    for (const replacement of input.replacements) {
      if (
        !replacement.productId ||
        !Number.isFinite(replacement.quantity) ||
        replacement.quantity <= 0
      ) {
        throw new ProductExchangeValidationError(
          'Replacement quantities must be positive.'
        )
      }

      productIds.add(replacement.productId)
    }

    const products = new Map<string, ProductRow>()

    // Siempre bloqueamos en orden estable para reducir riesgo de deadlocks.
    for (const productId of [...productIds].sort()) {
      const product = await lockProduct(client, context, productId)

      if (!product) {
        throw new ProductExchangeValidationError(
          'One of the exchange products was not found.'
        )
      }

      products.set(productId, product)
    }

    // Validamos primero todo el stock de salida.
    const replacementQuantities = new Map<string, number>()

    for (const replacement of input.replacements) {
      replacementQuantities.set(
        replacement.productId,
        (replacementQuantities.get(replacement.productId) || 0) +
          numeric(replacement.quantity)
      )
    }

    for (const [productId, quantity] of replacementQuantities) {
      const product = products.get(productId)!

      // Si el mismo producto vuelve en buen estado durante este cambio,
      // ese stock también estará disponible dentro de la transacción.
      const returningToStock = input.returnedItems.reduce((sum, returned) => {
        const saleItem = saleItems.get(returned.saleItemId)
        return saleItem?.product_id === productId
          ? sum + numeric(returned.restockQuantity)
          : sum
      }, 0)

      if (numeric(product.stock) + returningToStock < quantity) {
        throw new ProductExchangeValidationError(
          `${product.name} does not have enough stock.`
        )
      }
    }

    const exchangeResult = await client.query<ExchangeRow>(
      `insert into product_exchanges (
         organization_id,
         installation_id,
         store_id,
         sale_id,
         notes,
         created_by
       ) values (
         $1,$2,$3,$4,$5,$6
       )
       returning id, sale_id, created_at`,
      [
        ...scope(context),
        input.saleId,
        [
          `Motivo: ${input.reason || 'Cambio de producto'}`,
          input.reasonOther ? `Otro: ${input.reasonOther}` : null,
          input.notes || null,
        ]
          .filter(Boolean)
          .join(' | '),
        context.userId,
      ]
    )

    const exchange = exchangeResult.rows[0]

    for (const returned of input.returnedItems) {
      const item = saleItems.get(returned.saleItemId)!
      const restockQuantity = numeric(returned.restockQuantity)
      const damagedQuantity = numeric(returned.damagedQuantity)
      const returnedQuantity = restockQuantity + damagedQuantity
      const remainingQuantity = numeric(item.quantity) - returnedQuantity

      if (item.product_id && restockQuantity > 0) {
        const product = products.get(item.product_id)!
        const previousStock = numeric(product.stock)
        const newStock = previousStock + restockQuantity

        await client.query(
          `update products
              set stock = $1,
                  updated_at = now()
            where id = $2
              and organization_id = $3
              and installation_id = $4
              and store_id = $5`,
          [newStock, item.product_id, ...scope(context)]
        )

        product.stock = newStock

        await insertMovement(client, context, {
          productId: item.product_id,
          movementType: 'exchange_return_restock',
          quantity: restockQuantity,
          previousStock,
          newStock,
          exchangeId: exchange.id,
          notes: input.reason,
        })
      }

      if (item.product_id && damagedQuantity > 0) {
        const product = products.get(item.product_id)!
        const currentStock = numeric(product.stock)

        await client.query(
          `insert into damaged_inventory (
             organization_id,
             installation_id,
             store_id,
             product_id,
             sale_item_id,
             sale_id,
             exchange_id,
             imei,
             quantity,
             status,
             reason,
             reason_other,
             notes,
             original_stock
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,
             'pending_review',$10,$11,$12,$13
           )`,
          [
            ...scope(context),
            item.product_id,
            item.id,
            input.saleId,
            exchange.id,
            item.imei ?? null,
            damagedQuantity,
            input.reason || 'Cambio de producto',
            input.reasonOther ?? null,
            input.notes ?? null,
            currentStock,
          ]
        )

        await insertMovement(client, context, {
          productId: item.product_id,
          movementType: 'exchange_return_damaged',
          quantity: damagedQuantity,
          previousStock: currentStock,
          newStock: currentStock,
          exchangeId: exchange.id,
          notes: input.reason,
        })
      }

      const discountPerUnit =
        numeric(item.discount) / Math.max(1, numeric(item.quantity))

      const nextDiscount = discountPerUnit * remainingQuantity
      const nextTotal = Math.max(
        0,
        numeric(item.unit_price) * remainingQuantity - nextDiscount
      )

      if (remainingQuantity <= 0) {
        await client.query(
          `delete from sale_items
            where id = $1
              and sale_id = $2
              and organization_id = $3
              and installation_id = $4
              and store_id = $5`,
          [item.id, input.saleId, ...scope(context)]
        )
      } else {
        await client.query(
          `update sale_items
              set quantity = $1,
                  discount = $2,
                  total = $3
            where id = $4
              and sale_id = $5
              and organization_id = $6
              and installation_id = $7
              and store_id = $8`,
          [
            remainingQuantity,
            nextDiscount,
            nextTotal,
            item.id,
            input.saleId,
            ...scope(context),
          ]
        )
      }
    }

    for (const replacement of input.replacements) {
      const product = products.get(replacement.productId)!
      const quantity = numeric(replacement.quantity)
      const discount = Math.max(0, numeric(replacement.discount))
      const previousStock = numeric(product.stock)

      if (previousStock < quantity) {
        throw new ProductExchangeValidationError(
          `${product.name} does not have enough stock.`
        )
      }

      const newStock = previousStock - quantity
      const total = Math.max(
        0,
        numeric(product.sale_price) * quantity - discount
      )

      await client.query(
        `insert into sale_items (
           organization_id,
           installation_id,
           store_id,
           sale_id,
           product_id,
           product_name,
           sku,
           quantity,
           cost,
           unit_price,
           discount,
           total,
           imei
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
         )`,
        [
          ...scope(context),
          input.saleId,
          product.id,
          product.name,
          product.sku,
          quantity,
          numeric(product.cost),
          numeric(product.sale_price),
          discount,
          total,
          replacement.imei?.trim() || null,
        ]
      )

      await client.query(
        `update products
            set stock = $1,
                updated_at = now()
          where id = $2
            and organization_id = $3
            and installation_id = $4
            and store_id = $5`,
        [newStock, product.id, ...scope(context)]
      )

      product.stock = newStock

      await insertMovement(client, context, {
        productId: product.id,
        movementType: 'exchange_product_out',
        quantity,
        previousStock,
        newStock,
        exchangeId: exchange.id,
        notes: input.reason || 'Cambio de producto',
      })
    }

    const totalsResult = await client.query<{
      subtotal: string | number
      discount: string | number
      total: string | number
    }>(
      `select
         coalesce(sum(unit_price * quantity), 0) as subtotal,
         coalesce(sum(discount), 0) as discount,
         coalesce(sum(total), 0) as total
       from sale_items
       where sale_id = $1
         and organization_id = $2
         and installation_id = $3
         and store_id = $4`,
      [input.saleId, ...scope(context)]
    )

    const totals = totalsResult.rows[0]
    const nextSubtotal = numeric(totals.subtotal)
    const nextDiscount = numeric(totals.discount)
    const nextTotal = numeric(totals.total)

    const nextCardFee =
      numeric(sale.card_fee) + Math.max(0, numeric(input.extraCardFee))

    const cashReceivedAdded = Math.max(0, numeric(input.cashReceived))
    const nextCashReceived = numeric(sale.cash_received) + cashReceivedAdded

    const paymentMethodId =
      input.paymentMethodId &&
      !input.paymentMethodId.startsWith('virtual:')
        ? input.paymentMethodId
        : sale.payment_method_id

    await client.query(
      `update sales
          set subtotal = $1,
              discount = $2,
              total = $3,
              card_fee = $4,
              net_received = $5,
              payment_method_id = $6,
              cash_received = $7,
              notes = $8
        where id = $9
          and organization_id = $10
          and installation_id = $11
          and store_id = $12`,
      [
        nextSubtotal,
        nextDiscount,
        nextTotal,
        nextCardFee,
        nextTotal - nextCardFee,
        paymentMethodId,
        nextCashReceived,
        [
          'Factura editada por cambio de articulos.',
          `Motivo: ${
            input.reason === 'Otro'
              ? input.reasonOther || 'Otro'
              : input.reason || 'Cambio de producto'
          }`,
          input.notes || null,
        ]
          .filter(Boolean)
          .join(' '),
        input.saleId,
        ...scope(context),
      ]
    )

    return {
      id: exchange.id,
      saleId: input.saleId,
      createdAt: exchange.created_at,
      totals: {
        subtotal: nextSubtotal,
        discount: nextDiscount,
        total: nextTotal,
        cardFee: nextCardFee,
        netReceived: nextTotal - nextCardFee,
      },
    }
  })
}