import 'server-only'

import type { PoolClient } from 'pg'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type QuoteCustomerInput = {
  customerId: string
}

export type QuoteItemInput = {
  productId?: string | null
  productName: string
  quantity: number
  unitPrice: number
  tax?: number
  total: number
}

export type QuoteInput = {
  quoteNumber?: string
  status?: string
  subtotal: number
  tax: number
  total: number
  expiresAt?: string | null
  items: QuoteItemInput[]
  customer: QuoteCustomerInput
}

export type QuoteCustomer = {
  customer_id: string | null
  full_name: string
  document: string | null
  phone: string | null
  address: string | null
}

export type QuoteItem = {
  id: string
  quote_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  tax: number
  total: number
}

type QuoteItemRow = {
  id: string
  quote_id: string
  product_id: string | null
  product_name: string
  quantity: string | number
  unit_price: string | number
  tax: string | number
  total: string | number
}

export type Quote = {
  id: string
  quote_number: string
  status: string
  subtotal: number
  tax: number
  total: number
  expires_at: string | null
  created_at: string
  customer: QuoteCustomer | null
}

export class QuoteNotFoundError extends Error {
  constructor() {
    super('Quote not found in the current tenant.')
    this.name = 'QuoteNotFoundError'
  }
}

export class QuoteCustomerNotFoundError extends Error {
  constructor() {
    super('Customer not found in the current tenant.')
    this.name = 'QuoteCustomerNotFoundError'
  }
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const quoteSelect = `q.id, q.quote_number, q.status, q.subtotal, q.tax, q.total,
  q.expires_at, q.created_at, qc.customer_id, qc.full_name, qc.document, qc.phone, qc.address`

function number(value: string | number) {
  return Number(value) || 0
}

function mapQuote(row: Record<string, unknown>): Quote {
  return {
    id: String(row.id),
    quote_number: String(row.quote_number),
    status: String(row.status),
    subtotal: number(row.subtotal as string | number),
    tax: number(row.tax as string | number),
    total: number(row.total as string | number),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    created_at: String(row.created_at),
    customer: row.full_name
      ? {
          customer_id: row.customer_id ? String(row.customer_id) : null,
          full_name: String(row.full_name),
          document: row.document ? String(row.document) : null,
          phone: row.phone ? String(row.phone) : null,
          address: row.address ? String(row.address) : null,
        }
      : null,
  }
}

export async function listQuotes(context: TenantContext) {
  const rows = (
    await query<Record<string, unknown>>(
      `select ${quoteSelect}
         from quotes q
         left join quote_customers qc on qc.quote_id = q.id
        where q.organization_id = $1 and q.installation_id = $2 and q.store_id = $3
        order by q.created_at desc`,
      scope(context)
    )
  ).rows
  return rows.map(mapQuote)
}

export async function getQuoteItems(context: TenantContext, quoteId: string) {
  const rows = (
    await query<QuoteItemRow>(
      `select qi.id, qi.quote_id, qi.product_id, qi.product_name, qi.quantity, qi.unit_price, qi.tax, qi.total
         from quote_items qi
         inner join quotes q on q.id = qi.quote_id
        where qi.quote_id = $1
          and q.organization_id = $2 and q.installation_id = $3 and q.store_id = $4
        order by qi.id asc`,
      [quoteId, ...scope(context)]
    )
  ).rows
  return rows.map((item) => ({
    ...item,
    quantity: number(item.quantity),
    unit_price: number(item.unit_price),
    tax: number(item.tax),
    total: number(item.total),
  }))
}

export async function getQuoteById(context: TenantContext, id: string) {
  const result = await query<Record<string, unknown>>(
    `select ${quoteSelect}
       from quotes q
       left join quote_customers qc on qc.quote_id = q.id
      where q.id = $1
        and q.organization_id = $2 and q.installation_id = $3 and q.store_id = $4`,
    [id, ...scope(context)]
  )
  const row = result.rows[0]
  if (!row) return null
  return { ...mapQuote(row), items: await getQuoteItems(context, id) }
}

async function replaceQuoteItems(
  client: PoolClient,
  quoteId: string,
  items: QuoteItemInput[]
) {
  await client.query('delete from quote_items where quote_id = $1', [quoteId])
  for (const item of items) {
    await client.query(
      `insert into quote_items (quote_id, product_id, product_name, quantity, unit_price, tax, total)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [quoteId, item.productId ?? null, item.productName, item.quantity, item.unitPrice, item.tax ?? 0, item.total]
    )
  }
}

async function replaceQuoteCustomer(
  client: PoolClient,
  context: TenantContext,
  quoteId: string,
  customer: QuoteCustomerInput
) {
  await client.query('delete from quote_customers where quote_id = $1', [quoteId])
  const result = await client.query<{
    id: string
    full_name: string
    document: string | null
    phone: string | null
    address: string | null
  }>(
    `select id, full_name, document, phone, address from customers
      where id = $1 and organization_id = $2 and installation_id = $3 and store_id = $4`,
    [customer.customerId, ...scope(context)]
  )
  const source = result.rows[0]
  if (!source) throw new QuoteCustomerNotFoundError()
  await client.query(
    `insert into quote_customers (quote_id, customer_id, full_name, document, phone, address)
     values ($1, $2, $3, $4, $5, $6)`,
    [quoteId, source.id, source.full_name, source.document, source.phone, source.address]
  )
}

export async function createQuote(context: TenantContext, input: QuoteInput) {
  return withTransaction(async (client) => {
    const provisionalNumber = `PENDING-${crypto.randomUUID()}`
    const created = await client.query<{ id: string }>(
      `insert into quotes (
         organization_id, installation_id, store_id, quote_number, status, subtotal, tax, total, expires_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [...scope(context), provisionalNumber, input.status ?? 'draft', input.subtotal, input.tax, input.total, input.expiresAt ?? null]
    )
    const quoteId = created.rows[0].id
    await client.query(
      `update quotes set quote_number = $1
        where id = $2 and organization_id = $3 and installation_id = $4 and store_id = $5`,
      [input.quoteNumber?.trim() || `COT-${quoteId.toUpperCase()}`, quoteId, ...scope(context)]
    )
    await replaceQuoteItems(client, quoteId, input.items)
    await replaceQuoteCustomer(client, context, quoteId, input.customer)
    return quoteId
  })
}

export async function updateQuote(context: TenantContext, id: string, input: QuoteInput) {
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string; quote_number: string }>(
      `select id, quote_number from quotes
        where id = $1 and organization_id = $2 and installation_id = $3 and store_id = $4
        for update`,
      [id, ...scope(context)]
    )
    if (!existing.rows[0]) throw new QuoteNotFoundError()

    await client.query(
      `update quotes
          set quote_number = $1, status = $2, subtotal = $3, tax = $4, total = $5, expires_at = $6
        where id = $7 and organization_id = $8 and installation_id = $9 and store_id = $10`,
      [input.quoteNumber?.trim() || existing.rows[0].quote_number, input.status ?? 'draft', input.subtotal, input.tax, input.total, input.expiresAt ?? null, id, ...scope(context)]
    )
    await replaceQuoteItems(client, id, input.items)
    await replaceQuoteCustomer(client, context, id, input.customer)
    return id
  })
}

export async function deleteQuote(context: TenantContext, id: string) {
  const result = await query(
    `delete from quotes
      where id = $1 and organization_id = $2 and installation_id = $3 and store_id = $4`,
    [id, ...scope(context)]
  )
  return (result.rowCount ?? 0) > 0
}
