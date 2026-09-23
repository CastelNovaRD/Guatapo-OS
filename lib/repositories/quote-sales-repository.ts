import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

type QuoteRow = QueryResultRow & {
  id: string
  quote_number: string
  status: string
  subtotal: string | number
  tax: string | number
  total: string | number
}

type QuoteItemRow = QueryResultRow & {
  id: string
  product_id: string | null
  product_name: string
  quantity: string | number
  unit_price: string | number
  tax: string | number
  total: string | number
}

type QuoteCustomerRow = QueryResultRow & {
  customer_id: string | null
  full_name: string
  document: string | null
  phone: string | null
  address: string | null
}

type ProductRow = QueryResultRow & {
  id: string
  sku: string | null
  cost: string | number
  stock: string | number
}

type NcfReceiptRow = QueryResultRow & {
  id: string
  prefix: string
  range_start: string | number
  range_end: string | number
  next_number: string | number
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

function numeric(value: string | number) {
  return Number(value)
}

export class QuoteConversionNotFoundError extends Error {
  constructor() {
    super('Quote not found in the current tenant.')
    this.name = 'QuoteConversionNotFoundError'
  }
}

export class QuoteAlreadyConvertedError extends Error {
  constructor() {
    super('Quote has already been converted.')
    this.name = 'QuoteAlreadyConvertedError'
  }
}

export class QuoteConversionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuoteConversionValidationError'
  }
}

export class QuoteConversionStockError extends Error {
  constructor(productId: string) {
    super(`Insufficient stock for product ${productId}.`)
    this.name = 'QuoteConversionStockError'
  }
}

export class QuoteNcfUnavailableError extends Error {
  constructor() {
    super('No active NCF is available for this receipt type.')
    this.name = 'QuoteNcfUnavailableError'
  }
}

export type ConvertQuoteToSaleInput = {
  fiscalReceiptType: string
}

export type ConvertedQuoteSale = {
  saleId: string
  invoiceNumber: string | null
  ncf: string
}

async function lockQuote(
  client: PoolClient,
  context: TenantContext,
  quoteId: string
) {
  const result = await client.query<QuoteRow>(
    `select id, quote_number, status, subtotal, tax, total
       from quotes
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4
      for update`,
    [quoteId, ...scope(context)]
  )
  const quote = result.rows[0]
  if (!quote) throw new QuoteConversionNotFoundError()
  if (quote.status === 'completed') throw new QuoteAlreadyConvertedError()
  return quote
}

async function lockNcf(
  client: PoolClient,
  context: TenantContext,
  receiptType: string
) {
  const result = await client.query<NcfReceiptRow>(
    `select id, prefix, range_start, range_end, next_number
       from ncf_receipts
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
        and receipt_type = $4
        and active = true
        and (expires_at is null or expires_at >= current_date)
      for update`,
    [...scope(context), receiptType]
  )
  const receipt = result.rows[0]
  if (!receipt) throw new QuoteNcfUnavailableError()

  const rangeStart = numeric(receipt.range_start)
  const rangeEnd = numeric(receipt.range_end)
  const nextNumber = numeric(receipt.next_number)
  if (!Number.isInteger(nextNumber) || nextNumber < rangeStart || nextNumber > rangeEnd) {
    throw new QuoteNcfUnavailableError()
  }

  await client.query(
    `update ncf_receipts
        set next_number = $1
      where id = $2
        and organization_id = $3
        and installation_id = $4
        and store_id = $5`,
    [nextNumber + 1, receipt.id, ...scope(context)]
  )
  return `${receipt.prefix}${nextNumber}`
}

async function getLockedProduct(
  client: PoolClient,
  context: TenantContext,
  productId: string
) {
  const result = await client.query<ProductRow>(
    `select id, sku, cost, stock
       from products
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4
      for update`,
    [productId, ...scope(context)]
  )
  return result.rows[0] ?? null
}

/** Converts one tenant-scoped quote into a paid fiscal sale atomically. */
export async function convertQuoteToSale(
  context: TenantContext,
  quoteId: string,
  input: ConvertQuoteToSaleInput
): Promise<ConvertedQuoteSale> {
  if (!input.fiscalReceiptType.trim()) {
    throw new QuoteConversionValidationError('fiscalReceiptType is required.')
  }

  return withTransaction(async (client) => {
    const quote = await lockQuote(client, context, quoteId)
    const items = (await client.query<QuoteItemRow>(
      `select id, product_id, product_name, quantity, unit_price, tax, total
         from quote_items
        where quote_id = $1
        order by id`,
      [quoteId]
    )).rows
    if (items.length === 0) throw new QuoteConversionValidationError('Quote has no items.')

    const customer = (await client.query<QuoteCustomerRow>(
      `select customer_id, full_name, document, phone, address
         from quote_customers
        where quote_id = $1`,
      [quoteId]
    )).rows[0]
    if (!customer) throw new QuoteConversionValidationError('Quote customer snapshot is missing.')

    const productQuantities = new Map<string, number>()
    for (const item of items) {
      const quantity = numeric(item.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new QuoteConversionValidationError('Quote contains an invalid quantity.')
      }
      if (item.product_id) {
        productQuantities.set(item.product_id, (productQuantities.get(item.product_id) ?? 0) + quantity)
      }
    }

    const products = new Map<string, ProductRow>()
    for (const productId of [...productQuantities.keys()].sort()) {
      const product = await getLockedProduct(client, context, productId)
      if (!product || numeric(product.stock) < productQuantities.get(productId)!) {
        throw new QuoteConversionStockError(productId)
      }
      products.set(productId, product)
    }

    const ncf = await lockNcf(client, context, input.fiscalReceiptType.trim())
    const sale = await client.query<{ id: string; invoice_number: string | null }>(
      `insert into sales (
   organization_id, installation_id, store_id, invoice_number,
   customer_id, status,
   subtotal, discount, itbis, total, amount_paid, balance_due,
   ncf, fiscal_receipt_type, fiscal_status,
   fiscal_customer_name, fiscal_customer_rnc, fiscal_customer_phone,
   fiscal_customer_address, fiscal_customer_source, fiscal_notes, created_by
 ) values (
   $1, $2, $3,
   next_sale_invoice_number($1, $2, $3),
   $4, 'paid',
   $5, 0, $6, $7, $7, 0,
   $8, $9, 'ready_to_send',
   $10, $11, $12, $13, 'quote_snapshot', $14, $15
 ) returning id, invoice_number`,
      [
        ...scope(context),
        customer.customer_id,
        numeric(quote.subtotal),
        numeric(quote.tax),
        numeric(quote.total),
        ncf,
        input.fiscalReceiptType.trim(),
        customer.full_name,
        customer.document,
        customer.phone,
        customer.address,
        `Venta generada desde cotización ${quote.quote_number}.`,
        context.userId,
      ]
    )
    const saleRow = sale.rows[0]

    for (const item of items) {
      const product = item.product_id ? products.get(item.product_id) : null
      await client.query(
        `insert into sale_items (
           sale_id, product_id, product_name, sku, quantity, cost, unit_price, tax, total
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          saleRow.id,
          item.product_id,
          item.product_name,
          product?.sku ?? null,
          numeric(item.quantity),
          product ? numeric(product.cost) : 0,
          numeric(item.unit_price),
          numeric(item.tax),
          numeric(item.total),
        ]
      )
    }

    for (const [productId, quantity] of productQuantities) {
      const product = products.get(productId)!
      const previousStock = numeric(product.stock)
      const newStock = previousStock - quantity
      if (newStock < 0) throw new QuoteConversionStockError(productId)

      await client.query(
        `update products
            set stock = $1, updated_at = now()
          where id = $2
            and organization_id = $3
            and installation_id = $4
            and store_id = $5`,
        [newStock, productId, ...scope(context)]
      )
      await client.query(
        `insert into inventory_movements (
           organization_id, installation_id, store_id, product_id,
           type, movement_type, quantity, previous_stock, new_stock,
           reference_type, reference_id, created_by, notes
         ) values (
           $1, $2, $3, $4,
           'sale', 'sale', $5, $6, $7,
           'sale', $8, $9, $10
         )`,
        [
          ...scope(context),
          productId,
          -quantity,
          previousStock,
          newStock,
          saleRow.id,
          context.userId,
          `Venta generada desde cotización ${quote.quote_number}.`,
        ]
      )
    }

    await client.query(
      `update quotes set status = 'completed'
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4`,
      [quoteId, ...scope(context)]
    )

    return { saleId: saleRow.id, invoiceNumber: saleRow.invoice_number, ncf }
  })
}
