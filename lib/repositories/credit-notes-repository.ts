import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

type SaleRow = QueryResultRow & {
  id: string
  invoice_number: string | null
  subtotal: string | number
  itbis: string | number
  total: string | number
  ncf: string | null
  created_at: Date | string
  customer_id: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
}

type SaleItemRow = QueryResultRow & {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  quantity: string | number
  unit_price: string | number
  discount: string | number
  total: string | number
  imei: string | null
}

type ProductRow = QueryResultRow & {
  id: string
  stock: string | number
}

type ReturnedQuantityRow = QueryResultRow & {
  quantity: string | number
}

export type CreditNoteSale = {
  id: string
  invoice_number: string | null
  subtotal: number
  itbis: number
  total: number
  ncf: string | null
  created_at: string
  customer_id: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
}

export type CreditNoteSaleItem = {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

export type CreateCreditNoteItemInput = {
  saleItemId: string
  quantity: number
  restockQuantity: number
  damagedQuantity: number
  unitPrice: number
  taxAmount: number
  total: number
}

export type CreateCreditNoteInput = {
  saleId: string
  refundMethod: string
  reason: string
  reasonOther?: string | null
  notes?: string | null
  items: CreateCreditNoteItemInput[]
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

function numeric(value: string | number) {
  return Number(value)
}

export class CreditNoteValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreditNoteValidationError'
  }
}

export class CreditNoteSaleNotFoundError extends Error {
  constructor() {
    super('Sale not found.')
    this.name = 'CreditNoteSaleNotFoundError'
  }
}

function mapSale(row: SaleRow): CreditNoteSale {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    subtotal: numeric(row.subtotal),
    itbis: numeric(row.itbis),
    total: numeric(row.total),
    ncf: row.ncf,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    customer_id: row.customer_id,
    fiscal_customer_name: row.fiscal_customer_name,
    fiscal_customer_rnc: row.fiscal_customer_rnc,
  }
}

function mapSaleItem(row: SaleItemRow): CreditNoteSaleItem {
  return {
    id: row.id,
    sale_id: row.sale_id,
    product_id: row.product_id,
    product_name: row.product_name,
    quantity: numeric(row.quantity),
    unit_price: numeric(row.unit_price),
    discount: numeric(row.discount),
    total: numeric(row.total),
  }
}

export async function findSaleForCreditNote(
  context: TenantContext,
  search: string
): Promise<{ sale: CreditNoteSale; items: CreditNoteSaleItem[] } | null> {
  const value = search.trim()

  if (!value) return null

  const saleResult = await withTransaction(async (client) => {
    const result = await client.query<SaleRow>(
      `select
         id,
         invoice_number,
         subtotal,
         itbis,
         total,
         ncf,
         created_at,
         customer_id,
         fiscal_customer_name,
         fiscal_customer_rnc
       from sales
       where organization_id = $1
         and installation_id = $2
         and store_id = $3
         and (
           invoice_number = $4
           or id::text = $4
         )
       limit 1`,
      [...scope(context), value]
    )

    const sale = result.rows[0]
    if (!sale) return null

    const itemsResult = await client.query<SaleItemRow>(
      `select
         id,
         sale_id,
         product_id,
         product_name,
         quantity,
         unit_price,
         discount,
         total,
         imei
       from sale_items
       where sale_id = $1
       order by id`,
      [sale.id]
    )

    return {
      sale: mapSale(sale),
      items: itemsResult.rows.map(mapSaleItem),
    }
  })

  return saleResult
}

async function nextCreditNoteNumber(
  client: PoolClient,
  context: TenantContext
) {
  const result = await client.query<{ next_number: string }>(
    `select
       coalesce(
         max(
           case
             when credit_note_number ~ '^NC-[0-9]+$'
             then substring(credit_note_number from 4)::bigint
             else null
           end
         ),
         0
       ) + 1 as next_number
     from credit_notes
     where organization_id = $1
       and installation_id = $2
       and store_id = $3`,
    scope(context)
  )

  const next = Number(result.rows[0]?.next_number || 1)

  return `NC-${String(next).padStart(6, '0')}`
}

export async function createCreditNote(
  context: TenantContext,
  input: CreateCreditNoteInput
): Promise<string> {
  if (!input.saleId) {
    throw new CreditNoteValidationError('Sale is required.')
  }

  if (!input.reason.trim()) {
    throw new CreditNoteValidationError('Reason is required.')
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new CreditNoteValidationError(
      'Credit note must contain at least one item.'
    )
  }

  return withTransaction(async (client) => {
    const saleResult = await client.query<SaleRow>(
      `select
         id,
         invoice_number,
         subtotal,
         itbis,
         total,
         ncf,
         created_at,
         customer_id,
         fiscal_customer_name,
         fiscal_customer_rnc
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
      throw new CreditNoteSaleNotFoundError()
    }

    let subtotal = 0
    let taxAmount = 0
    let total = 0

    const validatedItems: Array<{
      saleItem: SaleItemRow
      quantity: number
      restockQuantity: number
      damagedQuantity: number
      unitPrice: number
      taxAmount: number
      total: number
    }> = []

    for (const item of input.items) {
      if (
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.restockQuantity) ||
        item.restockQuantity < 0 ||
        !Number.isFinite(item.damagedQuantity) ||
        item.damagedQuantity < 0 ||
        item.restockQuantity + item.damagedQuantity !== item.quantity
      ) {
        throw new CreditNoteValidationError(
          'Invalid credit note item quantities.'
        )
      }

      const saleItemResult = await client.query<SaleItemRow>(
        `select
           id,
           sale_id,
           product_id,
           product_name,
           quantity,
           unit_price,
           discount,
           total,
           imei
         from sale_items
         where id = $1
           and sale_id = $2
         for update`,
        [item.saleItemId, sale.id]
      )

      const saleItem = saleItemResult.rows[0]

      if (!saleItem) {
        throw new CreditNoteValidationError(
          'Sale item does not belong to this sale.'
        )
      }

      const returnedResult = await client.query<ReturnedQuantityRow>(
        `select coalesce(sum(cni.quantity), 0) as quantity
           from credit_note_items cni
           inner join credit_notes cn
             on cn.id = cni.credit_note_id
          where cni.sale_item_id = $1
            and cn.organization_id = $2
            and cn.installation_id = $3
            and cn.store_id = $4
            and cn.status <> 'cancelled'`,
        [saleItem.id, ...scope(context)]
      )

      const alreadyReturned = numeric(
        returnedResult.rows[0]?.quantity || 0
      )

      const soldQuantity = numeric(saleItem.quantity)

      if (alreadyReturned + item.quantity > soldQuantity) {
        throw new CreditNoteValidationError(
          `Returned quantity exceeds sold quantity for ${saleItem.product_name}.`
        )
      }

      if (
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice < 0 ||
        !Number.isFinite(item.taxAmount) ||
        item.taxAmount < 0 ||
        !Number.isFinite(item.total) ||
        item.total < 0
      ) {
        throw new CreditNoteValidationError(
          'Invalid credit note monetary values.'
        )
      }

      const lineSubtotal = item.unitPrice * item.quantity

      subtotal += lineSubtotal
      taxAmount += item.taxAmount
      total += item.total

      validatedItems.push({
        saleItem,
        quantity: item.quantity,
        restockQuantity: item.restockQuantity,
        damagedQuantity: item.damagedQuantity,
        unitPrice: item.unitPrice,
        taxAmount: item.taxAmount,
        total: item.total,
      })
    }

    if (total <= 0) {
      throw new CreditNoteValidationError(
        'Credit note total must be greater than zero.'
      )
    }

    const creditNoteNumber = await nextCreditNoteNumber(client, context)

    const creditNoteResult = await client.query<{ id: string }>(
      `insert into credit_notes (
         organization_id,
         installation_id,
         store_id,
         sale_id,
         credit_note_number,
         fiscal_number,
         reason,
         status,
         subtotal,
         tax_amount,
         total,
         available_balance,
         created_by
       )
       values (
         $1, $2, $3, $4, $5, null, $6, 'issued',
         $7, $8, $9, $9, $10
       )
       returning id`,
      [
        ...scope(context),
        sale.id,
        creditNoteNumber,
        input.reason.trim(),
        subtotal,
        taxAmount,
        total,
        context.userId,
      ]
    )

    const creditNoteId = creditNoteResult.rows[0].id

    for (const item of validatedItems) {
      await client.query(
        `insert into credit_note_items (
           credit_note_id,
           sale_item_id,
           product_id,
           quantity,
           restock_quantity,
           damaged_quantity,
           unit_price,
           tax_amount,
           line_total
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          creditNoteId,
          item.saleItem.id,
          item.saleItem.product_id,
          item.quantity,
          item.restockQuantity,
          item.damagedQuantity,
          item.unitPrice,
          item.taxAmount,
          item.total,
        ]
      )

      if (item.restockQuantity > 0) {
        const productResult = await client.query<ProductRow>(
          `select id, stock
             from products
            where id = $1
              and organization_id = $2
              and installation_id = $3
              and store_id = $4
            for update`,
          [item.saleItem.product_id, ...scope(context)]
        )

        const product = productResult.rows[0]

        if (!product) {
          throw new CreditNoteValidationError(
            `Product not found: ${item.saleItem.product_name}.`
          )
        }

        const previousStock = numeric(product.stock)
        const newStock = previousStock + item.restockQuantity

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
             'in',
             $5,
             'credit_note',
             $6,
             $7,
             $8,
             $9,
             $10,
             'credit_note_return'
           )`,
          [
            ...scope(context),
            item.saleItem.product_id,
            item.restockQuantity,
            creditNoteId,
            context.userId,
            previousStock,
            newStock,
            `Devolucion por nota de credito ${creditNoteNumber}.`,
          ]
        )
      }

      if (item.damagedQuantity > 0) {
        const productResult = await client.query<ProductRow>(
          `select id, stock
             from products
            where id = $1
              and organization_id = $2
              and installation_id = $3
              and store_id = $4
            for update`,
          [item.saleItem.product_id, ...scope(context)]
        )

        const product = productResult.rows[0]

        if (!product) {
          throw new CreditNoteValidationError(
            `Product not found: ${item.saleItem.product_name}.`
          )
        }

        await client.query(
          `insert into damaged_inventory (
             organization_id,
             installation_id,
             store_id,
             product_id,
             sale_item_id,
             credit_note_id,
             quantity,
             status,
             reason,
             sale_id,
             imei,
             notes,
             reason_other,
             original_stock
           )
           values (
             $1, $2, $3, $4, $5, $6, $7,
             'pending',
             $8,
             $9,
             $10,
             $11,
             $12,
             $13
           )`,
          [
            ...scope(context),
            item.saleItem.product_id,
            item.saleItem.id,
            creditNoteId,
            item.damagedQuantity,
            input.reason.trim(),
            sale.id,
            item.saleItem.imei,
            input.notes?.trim() || null,
            input.reasonOther?.trim() || null,
            numeric(product.stock),
          ]
        )
      }
    }

    return creditNoteId
  })
}
export type CreditNoteDocument = {
  id: string
  credit_note_number: string
  fiscal_number: string | null
  refund_method: null
  reason: string | null
  reason_other: null
  notes: null
  subtotal: number
  tax_amount: number
  total: number
  status: string
  created_at: string
  sale: {
    id: string
    invoice_number: string | null
    ncf: string | null
    fiscal_customer_name: string | null
    fiscal_customer_rnc: string | null
    created_at: string
  } | null
  items: Array<{
    id: string
    product_name: string
    quantity: number
    unit_price: number
    tax_amount: number
    total: number
    restock_quantity: number
    damaged_quantity: number
    disposition: 'restocked' | 'damaged' | 'mixed' | null
    notes: null
  }>
}

type CreditNoteDocumentRow = QueryResultRow & {
  id: string
  credit_note_number: string
  fiscal_number: string | null
  reason: string | null
  subtotal: string | number
  tax_amount: string | number
  total: string | number
  status: string
  created_at: Date | string
  sale_id: string | null
  invoice_number: string | null
  ncf: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
  sale_created_at: Date | string | null
}

type CreditNoteDocumentItemRow = QueryResultRow & {
  id: string
  product_name: string
  quantity: string | number
  unit_price: string | number
  tax_amount: string | number
  line_total: string | number
  restock_quantity: string | number
  damaged_quantity: string | number
}

function documentDate(value: Date | string | null) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

export async function getCreditNoteById(
  context: TenantContext,
  id: string
): Promise<CreditNoteDocument | null> {
  return withTransaction(async (client) => {
    const noteResult = await client.query<CreditNoteDocumentRow>(
      `select
         cn.id,
         cn.credit_note_number,
         cn.fiscal_number,
         cn.reason,
         cn.subtotal,
         cn.tax_amount,
         cn.total,
         cn.status,
         cn.created_at,
         s.id as sale_id,
         s.invoice_number,
         s.ncf,
         s.fiscal_customer_name,
         s.fiscal_customer_rnc,
         s.created_at as sale_created_at
       from credit_notes cn
       left join sales s
         on s.id = cn.sale_id
        and s.organization_id = cn.organization_id
        and s.installation_id = cn.installation_id
        and s.store_id = cn.store_id
      where cn.id = $1
        and cn.organization_id = $2
        and cn.installation_id = $3
        and cn.store_id = $4
      limit 1`,
      [id, ...scope(context)]
    )

    const note = noteResult.rows[0]
    if (!note) return null

    const itemsResult = await client.query<CreditNoteDocumentItemRow>(
      `select
         cni.id,
         si.product_name,
         cni.quantity,
         cni.unit_price,
         cni.tax_amount,
         cni.line_total,
         cni.restock_quantity,
         cni.damaged_quantity
       from credit_note_items cni
       join sale_items si
         on si.id = cni.sale_item_id
        and si.sale_id = $1
      where cni.credit_note_id = $2
      order by cni.id`,
      [note.sale_id, note.id]
    )

    return {
      id: note.id,
      credit_note_number: note.credit_note_number,
      fiscal_number: note.fiscal_number,
      refund_method: null,
      reason: note.reason,
      reason_other: null,
      notes: null,
      subtotal: numeric(note.subtotal),
      tax_amount: numeric(note.tax_amount),
      total: numeric(note.total),
      status: note.status,
      created_at: documentDate(note.created_at) ?? '',
      sale: note.sale_id
        ? {
            id: note.sale_id,
            invoice_number: note.invoice_number,
            ncf: note.ncf,
            fiscal_customer_name: note.fiscal_customer_name,
            fiscal_customer_rnc: note.fiscal_customer_rnc,
            created_at: documentDate(note.sale_created_at) ?? '',
          }
        : null,
      items: itemsResult.rows.map((item) => {
        const restockQuantity = numeric(item.restock_quantity)
        const damagedQuantity = numeric(item.damaged_quantity)
        return {
          id: item.id,
          product_name: item.product_name,
          quantity: numeric(item.quantity),
          unit_price: numeric(item.unit_price),
          tax_amount: numeric(item.tax_amount),
          total: numeric(item.line_total),
          restock_quantity: restockQuantity,
          damaged_quantity: damagedQuantity,
          disposition:
            restockQuantity > 0 && damagedQuantity > 0
              ? 'mixed'
              : restockQuantity > 0
                ? 'restocked'
                : damagedQuantity > 0
                  ? 'damaged'
                  : null,
          notes: null,
        }
      }),
    }
  })
}