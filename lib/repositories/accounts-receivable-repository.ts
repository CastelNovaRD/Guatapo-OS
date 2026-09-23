import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type ReceivableSale = QueryResultRow & {
  id: string
  invoice_number: string | null
  subtotal: number
  discount: number
  itbis: number
  total: number
  status: string
  sale_channel: string
  created_at: string
  customer_id: string | null
  payment_method_id: string | null
  amount_paid: number
  balance_due: number
  ncf: string | null
  fiscal_receipt_type: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
  fiscal_customer_phone: string | null
  fiscal_customer_address: string | null
}

export type ReceivableCustomer = QueryResultRow & {
  id: string
  full_name: string
  phone: string | null
  cedula: string | null
}

export type ReceivablePayment = QueryResultRow & {
  id: string
  sale_id: string
  amount: number
}

export type ReceivableSaleItem = QueryResultRow & {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
  imei: string | null
}

export type ReceivablePaymentMethod = QueryResultRow & {
  id: string
  name: string
}

export type RegisterReceivablePaymentInput = {
  saleIds: string[]
  amount: number
  paymentDate?: string | null
  reference?: string | null
  notes?: string | null
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

function numeric(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

export async function listReceivableSales(context: TenantContext) {
  const result = await query<ReceivableSale>(
    `select
       id,
       invoice_number,
       subtotal,
       discount,
       itbis,
       total,
       status,
       sale_channel,
       created_at,
       customer_id,
       payment_method_id,
       amount_paid,
       balance_due,
       ncf,
       fiscal_receipt_type,
       fiscal_customer_name,
       fiscal_customer_rnc,
       fiscal_customer_phone,
       fiscal_customer_address
     from sales
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and status in ('credit', 'pending')
     order by created_at desc`,
    scope(context)
  )

  return result.rows
}

export async function listReceivableCustomers(
  context: TenantContext,
  customerIds: string[]
) {
  if (!customerIds.length) return []

  const result = await query<ReceivableCustomer>(
    `select
       id,
       full_name,
       phone,
       document as cedula
     from customers
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and id = any($4::uuid[])`,
    [...scope(context), customerIds]
  )

  return result.rows
}

export async function listReceivablePayments(
  context: TenantContext,
  saleIds: string[]
) {
  if (!saleIds.length) return []

  const result = await query<ReceivablePayment>(
    `select
       id,
       sale_id,
       amount
     from sale_payments
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and sale_id = any($4::uuid[])
     order by created_at asc, id asc`,
    [...scope(context), saleIds]
  )

  return result.rows
}

export async function getReceivableSaleItems(
  context: TenantContext,
  saleId: string
) {
  const result = await query<ReceivableSaleItem>(
    `select
       si.id,
       si.product_name,
       si.quantity,
       si.unit_price,
       si.discount,
       si.total,
       si.imei
     from sale_items si
     inner join sales s
       on s.id = si.sale_id
     where si.sale_id = $4
       and s.organization_id = $1
       and s.installation_id = $2
       and s.store_id = $3
     order by si.id`,
    [...scope(context), saleId]
  )

  return result.rows
}

export async function getReceivablePaymentMethod(
  context: TenantContext,
  paymentMethodId: string
) {
  const result = await query<ReceivablePaymentMethod>(
    `select id, name
     from payment_methods
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and id = $4
     limit 1`,
    [...scope(context), paymentMethodId]
  )

  return result.rows[0] ?? null
}

async function getLockedReceivableSale(
  client: PoolClient,
  context: TenantContext,
  saleId: string
) {
  const result = await client.query<ReceivableSale>(
    `select
       id,
       invoice_number,
       subtotal,
       discount,
       itbis,
       total,
       status,
       sale_channel,
       created_at,
       customer_id,
       payment_method_id,
       amount_paid,
       balance_due,
       ncf,
       fiscal_receipt_type,
       fiscal_customer_name,
       fiscal_customer_rnc,
       fiscal_customer_phone,
       fiscal_customer_address
     from sales
     where id = $4
       and organization_id = $1
       and installation_id = $2
       and store_id = $3
     for update`,
    [...scope(context), saleId]
  )

  return result.rows[0] ?? null
}

export async function registerReceivablePayment(
  context: TenantContext,
  input: RegisterReceivablePaymentInput
) {
  const saleIds = Array.from(
    new Set(
      input.saleIds
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )

  if (!saleIds.length) {
    throw new Error('Selecciona una o varias facturas.')
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('El monto recibido debe ser mayor que cero.')
  }

  return withTransaction(async (client) => {
    let remaining = input.amount
    const payments: Array<{
      saleId: string
      amount: number
      balanceDue: number
      status: string
    }> = []

    for (const saleId of saleIds) {
      if (remaining <= 0) break

      const sale = await getLockedReceivableSale(
        client,
        context,
        saleId
      )

      if (!sale) {
        throw new Error(
          'Una de las facturas seleccionadas no existe o no pertenece a esta tienda.'
        )
      }

      if (!['credit', 'pending'].includes(sale.status)) {
        throw new Error(
          `La factura ${sale.invoice_number || sale.id} ya no está pendiente de cobro.`
        )
      }

      const currentPaid = numeric(sale.amount_paid)
      const storedBalance = numeric(sale.balance_due)

      const currentBalance =
        storedBalance > 0
          ? storedBalance
          : Math.max(0, numeric(sale.total) - currentPaid)

      if (currentBalance <= 0) continue

      const amountForSale = Math.min(
        currentBalance,
        remaining
      )

      const newPaid = currentPaid + amountForSale
      const newBalance = Math.max(
        0,
        numeric(sale.total) - newPaid
      )

      const paymentDate =
        input.paymentDate?.trim() ||
        new Date().toISOString()

      await client.query(
        `insert into sale_payments (
           organization_id,
           installation_id,
           store_id,
           sale_id,
           payment_method,
           amount,
           created_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7::timestamptz
         )`,
        [
          ...scope(context),
          sale.id,
          'accounts_receivable',
          amountForSale,
          paymentDate,
        ]
      )

      const nextStatus = newBalance <= 0 ? 'paid' : sale.status

      await client.query(
        `update sales
            set amount_paid = $1,
                balance_due = $2,
                status = $3
          where id = $4
            and organization_id = $5
            and installation_id = $6
            and store_id = $7`,
        [
          newPaid,
          newBalance,
          nextStatus,
          sale.id,
          ...scope(context),
        ]
      )

      payments.push({
        saleId: sale.id,
        amount: amountForSale,
        balanceDue: newBalance,
        status: nextStatus,
      })

      remaining -= amountForSale
    }

    if (!payments.length) {
      throw new Error(
        'Las facturas seleccionadas ya no tienen balance pendiente.'
      )
    }

    return {
      payments,
      appliedAmount: input.amount - remaining,
      unappliedAmount: remaining,
    }
  })
}