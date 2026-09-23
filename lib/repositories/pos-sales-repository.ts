import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

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

type CreditNoteRow = QueryResultRow & {
  id: string
  credit_note_number: string
  available_balance: string | number
}

export type PosSaleItemInput = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  discount?: number
  imei?: string | null
}

export type PosSalePaymentInput = {
  paymentMethodId?: string | null
  paymentMethod: 'cash' | 'transfer' | 'card' | 'credit_note'
  amount: number
  reference?: string | null
  creditNoteId?: string | null
  cardFee?: number
}

export type CreatePosSaleInput = {
  cashRegisterId?: string | null
  customerId?: string | null

  subtotal: number
  discount: number
  tax: number
  total: number
  shippingCost?: number
  cardFee?: number
  netReceived?: number
  cashReceived?: number
  cashChange?: number

  pendingPayment?: boolean
  paymentMethodId?: string | null

  fiscalReceiptType?: string | null
  fiscalCustomerName?: string | null
  fiscalCustomerRnc?: string | null
  fiscalCustomerPhone?: string | null
  fiscalCustomerAddress?: string | null
  fiscalCustomerSource?: string | null
  fiscalNotes?: string | null

  notes?: string | null

  items: PosSaleItemInput[]
  payments?: PosSalePaymentInput[]
}

export type CreatedPosSale = {
  saleId: string
  invoiceNumber: string | null
  createdAt: string
  ncf: string | null
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

function numeric(value: string | number) {
  return Number(value)
}

export class PosSaleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PosSaleValidationError'
  }
}

export class PosSaleStockError extends Error {
  constructor(productId: string) {
    super(`Insufficient stock for product ${productId}.`)
    this.name = 'PosSaleStockError'
  }
}

export class PosSaleNcfUnavailableError extends Error {
  constructor() {
    super('No active NCF is available for this receipt type.')
    this.name = 'PosSaleNcfUnavailableError'
  }
}

export class PosSaleCreditNoteError extends Error {
  constructor(message = 'Credit note is unavailable or has insufficient balance.') {
    super(message)
    this.name = 'PosSaleCreditNoteError'
  }
}

async function lockProduct(
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

  if (!receipt) {
    throw new PosSaleNcfUnavailableError()
  }

  const rangeStart = numeric(receipt.range_start)
  const rangeEnd = numeric(receipt.range_end)
  const nextNumber = numeric(receipt.next_number)

  if (
    !Number.isInteger(nextNumber) ||
    nextNumber < rangeStart ||
    nextNumber > rangeEnd
  ) {
    throw new PosSaleNcfUnavailableError()
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

export async function findAvailableCreditNote(
  context: TenantContext,
  creditNoteNumber: string
) {
  const result = await query<{
    id: string
    sale_id: string | null
    credit_note_number: string
    total: string | number
    available_balance: string | number
    used_at: string | null
    customer_id: string | null
    fiscal_customer_name: string | null
    fiscal_customer_rnc: string | null
  }>(
    `select
       cn.id,
       cn.sale_id,
       cn.credit_note_number,
       cn.total,
       cn.available_balance,
       cn.used_at,
       s.customer_id,
       s.fiscal_customer_name,
       s.fiscal_customer_rnc
     from credit_notes cn
     left join sales s
       on s.id = cn.sale_id
      and s.organization_id = cn.organization_id
      and s.installation_id = cn.installation_id
      and s.store_id = cn.store_id
     where cn.organization_id = $1
       and cn.installation_id = $2
       and cn.store_id = $3
       and lower(cn.credit_note_number) = lower($4)
     limit 1`,
    [
      ...scope(context),
      creditNoteNumber.trim(),
    ]
  )

  const note = result.rows[0]

  if (!note) return null

  return {
    id: note.id,
    sale_id: note.sale_id,
    credit_note_number: note.credit_note_number,
    total: numeric(note.total),
    available_balance: numeric(note.available_balance),
    used_at: note.used_at,
    customer_id: note.customer_id,
    customer_name: note.fiscal_customer_name,
    customer_rnc: note.fiscal_customer_rnc,
  }
}

async function consumeCreditNote(
  client: PoolClient,
  context: TenantContext,
  creditNoteId: string,
  amount: number
) {
  const result = await client.query<CreditNoteRow>(
    `select id, credit_note_number, available_balance
       from credit_notes
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4
        and status = 'issued'
      for update`,
    [creditNoteId, ...scope(context)]
  )

  const creditNote = result.rows[0]

  if (!creditNote) {
    throw new PosSaleCreditNoteError()
  }

  const available = numeric(creditNote.available_balance)

  if (!Number.isFinite(available) || amount <= 0 || amount > available) {
    throw new PosSaleCreditNoteError()
  }

  const newBalance = Math.max(0, available - amount)

  await client.query(
    `update credit_notes
        set available_balance = $1,
            used_at = case when $1 <= 0 then now() else null end,
            updated_at = now()
      where id = $2
        and organization_id = $3
        and installation_id = $4
        and store_id = $5`,
    [newBalance, creditNote.id, ...scope(context)]
  )
}

export async function createPosSale(
  context: TenantContext,
  input: CreatePosSaleInput
): Promise<CreatedPosSale> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PosSaleValidationError('Sale must contain at least one item.')
  }

  if (!Number.isFinite(input.total) || input.total < 0) {
    throw new PosSaleValidationError('Invalid sale total.')
  }

  return withTransaction(async (client) => {
    const productQuantities = new Map<string, number>()

    for (const item of input.items) {
      if (
        !item.productId ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice < 0
      ) {
        throw new PosSaleValidationError('Sale contains an invalid item.')
      }

      productQuantities.set(
        item.productId,
        (productQuantities.get(item.productId) ?? 0) + item.quantity
      )
    }

    const products = new Map<string, ProductRow>()

    for (const productId of [...productQuantities.keys()].sort()) {
      const product = await lockProduct(client, context, productId)
      const requiredQuantity = productQuantities.get(productId)!

      if (!product || numeric(product.stock) < requiredQuantity) {
        throw new PosSaleStockError(productId)
      }

      products.set(productId, product)
    }

    let ncf: string | null = null

    if (input.fiscalReceiptType?.trim()) {
      ncf = await lockNcf(
        client,
        context,
        input.fiscalReceiptType.trim()
      )
    }

    const pendingPayment = Boolean(input.pendingPayment)

    const saleResult = await client.query<{
      id: string
      invoice_number: string | null
      created_at: string
    }>(
      `insert into sales (
         organization_id,
         installation_id,
         store_id,
         invoice_number,
         customer_id,
         cash_register_id,
         payment_method_id,
         sale_channel,
         status,
         subtotal,
         discount,
         itbis,
         total,
         shipping_cost,
         card_fee,
         net_received,
         cash_received,
         cash_change,
         amount_paid,
         balance_due,
         ncf,
         fiscal_receipt_type,
         fiscal_status,
         fiscal_customer_name,
         fiscal_customer_rnc,
         fiscal_customer_phone,
         fiscal_customer_address,
         fiscal_customer_source,
         fiscal_notes,
         notes,
         created_by
       ) values (
  $1,
  $2,
  $3,
  next_sale_invoice_number($1, $2, $3),
  $4,
  $5,
  $6,
  'pos',
  $7,
  $8,
  $9,
  $10,
  $11,
  $12,
  $13,
  $14,
  $15,
  $16,
  $17,
  $18,
  $19,
  $20,
  $21,
  $22,
  $23,
  $24,
  $25,
  $26,
  $27,
  $28,
  $29
)
       returning id, invoice_number, created_at`,
      [
        ...scope(context),
        input.customerId ?? null,
        pendingPayment ? null : input.cashRegisterId ?? null,
        pendingPayment ? null : input.paymentMethodId ?? null,
        pendingPayment ? 'pending' : 'paid',
        input.subtotal,
        input.discount,
        input.tax,
        input.total,
        input.shippingCost ?? 0,
        pendingPayment ? 0 : input.cardFee ?? 0,
        input.netReceived ?? 0,
        pendingPayment ? 0 : input.cashReceived ?? 0,
        pendingPayment ? 0 : input.cashChange ?? 0,
        pendingPayment ? 0 : input.total,
        pendingPayment ? input.total : 0,
        ncf,
        input.fiscalReceiptType?.trim() || null,
        ncf ? 'ready_to_send' : 'not_applicable',
        ncf ? input.fiscalCustomerName?.trim() || null : null,
        ncf ? input.fiscalCustomerRnc?.trim() || null : null,
        ncf ? input.fiscalCustomerPhone?.trim() || null : null,
        ncf ? input.fiscalCustomerAddress?.trim() || null : null,
        ncf ? input.fiscalCustomerSource ?? null : null,
        ncf ? input.fiscalNotes?.trim() || null : null,
        input.notes?.trim() || null,
        context.userId,
      ]
    )

    const sale = saleResult.rows[0]

    for (const item of input.items) {
      const product = products.get(item.productId)!

      await client.query(
        `insert into sale_items (
           sale_id,
           product_id,
           product_name,
           sku,
           quantity,
           cost,
           unit_price,
           tax,
           discount,
           total,
           imei
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
  sale.id,
  item.productId,
  item.productName,
  product.sku,
  item.quantity,
  numeric(product.cost),
  item.unitPrice,
  0,
  item.discount ?? 0,
  Math.max(
    0,
    item.unitPrice * item.quantity - (item.discount ?? 0)
  ),
  item.imei?.trim() || null,
]
      )
    }

    if (!pendingPayment) {
      for (const payment of input.payments ?? []) {
        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          throw new PosSaleValidationError('Invalid sale payment.')
        }

        await client.query(
          `insert into sale_payments (
             organization_id,
             installation_id,
             store_id,
             sale_id,
             payment_method_id,
             credit_note_id,
             payment_method,
             amount,
             reference,
             card_fee
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            ...scope(context),
            sale.id,
            payment.paymentMethodId ?? null,
            payment.creditNoteId ?? null,
            payment.paymentMethod,
            payment.amount,
            payment.reference ?? null,
            payment.cardFee ?? 0,
          ]
        )

        if (
          payment.paymentMethod === 'credit_note' &&
          payment.creditNoteId
        ) {
          await consumeCreditNote(
            client,
            context,
            payment.creditNoteId,
            payment.amount
          )
        }
      }
    }

    for (const [productId, quantity] of productQuantities) {
      const product = products.get(productId)!
      const previousStock = numeric(product.stock)
      const newStock = previousStock - quantity

      if (newStock < 0) {
        throw new PosSaleStockError(productId)
      }

      await client.query(
        `update products
            set stock = $1,
                updated_at = now()
          where id = $2
            and organization_id = $3
            and installation_id = $4
            and store_id = $5`,
        [newStock, productId, ...scope(context)]
      )

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
           'sale','sale',$5,$6,$7,
           'sale',$8,$9,$10
         )`,
        [
          ...scope(context),
          productId,
          -quantity,
          previousStock,
          newStock,
          sale.id,
          context.userId,
          input.notes?.trim() || 'Venta POS',
        ]
      )
    }

    return {
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      createdAt: sale.created_at,
      ncf,
    }
  })
}