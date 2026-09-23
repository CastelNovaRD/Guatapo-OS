import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type SalesHistorySale = {
  id: string
  invoice_number: string | null
  subtotal: number
  discount: number
  itbis: number
  total: number
  shipping_cost: number
  card_fee: number
  net_received: number
  cash_received: number
  cash_change: number
  status: string
  sale_channel: string
  created_at: string
  customer_id: string | null
  payment_method_id: string | null
  ncf: string | null
  fiscal_receipt_type: string | null
  fiscal_status: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
  fiscal_customer_phone: string | null
  fiscal_customer_address: string | null
  fiscal_notes: string | null
  cashier_name: string | null
}

export type SalesHistoryItem = {
  id: string
  sale_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  cost: number
  discount: number
  total: number
  imei: string | null
}

export type SaleCustomer = {
  id: string
  full_name: string
  phone: string | null
  document: string | null
  cedula: string | null
}

export type SalePaymentMethod = {
  id: string
  name: string
}

export type SaleCreditNote = {
  id: string
  sale_id: string
  credit_note_number: string | null
  total: number
  created_at: string
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const saleSelect = `
  s.id,
  s.invoice_number,
  s.subtotal,
  s.discount,
  s.itbis,
  s.total,
  s.shipping_cost,
  s.card_fee,
  s.net_received,
  s.cash_received,
  s.cash_change,
  s.status,
  s.sale_channel,
  s.created_at,
  s.customer_id,
  s.payment_method_id,
  s.ncf,
  s.fiscal_receipt_type,
  s.fiscal_status,
  s.fiscal_customer_name,
  s.fiscal_customer_rnc,
  s.fiscal_customer_phone,
  s.fiscal_customer_address,
  s.fiscal_notes,
  p.full_name as cashier_name
`

const saleProfileJoin = `
  left join app_profiles p
    on p.id = s.created_by
   and p.organization_id = s.organization_id
   and p.installation_id = s.installation_id
`

export async function listSales(context: TenantContext) {
  const result = await query<SalesHistorySale>(
    `select ${saleSelect}
     from sales s
     ${saleProfileJoin}
     where s.organization_id = $1
       and s.installation_id = $2
       and s.store_id = $3
     order by s.created_at desc`,
    scope(context)
  )

  return result.rows
}

export async function listSaleItems(
  context: TenantContext,
  saleId?: string
) {
  const values: unknown[] = [...scope(context)]
  let saleFilter = ''

  if (saleId) {
    values.push(saleId)
    saleFilter = `and si.sale_id = $4`
  }

  const result = await query<SalesHistoryItem>(
    `select
       si.id,
       si.sale_id,
       si.product_name,
       si.quantity,
       si.unit_price,
       si.cost,
       si.discount,
       si.total,
       si.imei
     from sale_items si
     inner join sales s
       on s.id = si.sale_id
     where s.organization_id = $1
       and s.installation_id = $2
       and s.store_id = $3
       ${saleFilter}
     order by si.id`,
    values
  )

  return result.rows
}

export async function getSaleCustomer(
  context: TenantContext,
  customerId: string
) {
  const result = await query<SaleCustomer>(
    `select id, full_name, phone, document, document as cedula
     from customers
     where id = $4
       and organization_id = $1
       and installation_id = $2
       and store_id = $3
     limit 1`,
    [...scope(context), customerId]
  )

  return result.rows[0] ?? null
}

export async function getSalePaymentMethod(
  context: TenantContext,
  paymentMethodId: string
) {
  const result = await query<SalePaymentMethod>(
    `select id, name
     from payment_methods
     where id = $4
       and organization_id = $1
       and installation_id = $2
       and store_id = $3
     limit 1`,
    [...scope(context), paymentMethodId]
  )

  return result.rows[0] ?? null
}

export async function listSaleCreditNotes(
  context: TenantContext,
  saleId: string
) {
  const result = await query<SaleCreditNote>(
    `select
       id,
       sale_id,
       credit_note_number,
       total,
       created_at
     from credit_notes
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and sale_id = $4
     order by created_at desc`,
    [...scope(context), saleId]
  )

  return result.rows
}

export async function listSaleCustomersByIds(
  context: TenantContext,
  customerIds: string[]
) {
  if (!customerIds.length) return []

  const result = await query<Pick<SaleCustomer, 'id' | 'full_name'>>(
    `select id, full_name
     from customers
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and id = any($4::uuid[])`,
    [...scope(context), customerIds]
  )

  return result.rows
}

export async function listSalePaymentMethodsByIds(
  context: TenantContext,
  paymentMethodIds: string[]
) {
  if (!paymentMethodIds.length) return []

  const result = await query<SalePaymentMethod>(
    `select id, name
     from payment_methods
     where organization_id = $1
       and installation_id = $2
       and store_id = $3
       and id = any($4::uuid[])`,
    [...scope(context), paymentMethodIds]
  )

  return result.rows
}

export async function getSaleByInvoiceNumber(
  context: TenantContext,
  invoiceNumber: string
) {
  const result = await query<SalesHistorySale>(
    `select ${saleSelect}
     from sales s
     ${saleProfileJoin}
     where s.organization_id = $1
       and s.installation_id = $2
       and s.store_id = $3
       and s.invoice_number = $4
     limit 1`,
    [...scope(context), invoiceNumber]
  )

  return result.rows[0] ?? null
}

export async function getSaleById(
  context: TenantContext,
  saleId: string
) {
  const result = await query<SalesHistorySale>(
    `select ${saleSelect}
     from sales s
     ${saleProfileJoin}
     where s.organization_id = $1
       and s.installation_id = $2
       and s.store_id = $3
       and s.id = $4
     limit 1`,
    [...scope(context), saleId]
  )

  return result.rows[0] ?? null
}
