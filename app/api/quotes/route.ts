import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createQuote, listQuotes, QuoteCustomerNotFoundError, type QuoteInput } from '@/lib/repositories/quotes-repository'

const tenantFields = new Set(['organization_id', 'installation_id', 'store_id', 'organizationId', 'installationId', 'storeId'])
const quoteFields = new Set(['quoteNumber', 'status', 'subtotal', 'tax', 'total', 'expiresAt', 'items', 'customer'])

function hasTenantField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(hasTenantField)
  return Object.entries(value).some(([key, nested]) => tenantFields.has(key) || hasTenantField(nested))
}

function validCustomer(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || hasTenantField(value)) return false
  const customer = value as Record<string, unknown>
  return Object.keys(customer).length === 1 && typeof customer.customerId === 'string' && customer.customerId.trim() !== ''
}

function validQuoteInput(value: unknown): value is QuoteInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (Object.keys(input).some((key) => !quoteFields.has(key)) || hasTenantField(input) || !validCustomer(input.customer)) return false
  if (input.quoteNumber !== undefined && (typeof input.quoteNumber !== 'string' || !input.quoteNumber.trim())) return false
  if (input.status !== undefined && typeof input.status !== 'string') return false
  if (![input.subtotal, input.tax, input.total].every((number) => typeof number === 'number' && Number.isFinite(number) && number >= 0)) return false
  if (input.expiresAt !== undefined && input.expiresAt !== null && typeof input.expiresAt !== 'string') return false
  if (!Array.isArray(input.items) || input.items.length === 0) return false
  return input.items.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || hasTenantField(item)) return false
    const row = item as Record<string, unknown>
    return (row.productId === undefined || row.productId === null || typeof row.productId === 'string') &&
      typeof row.productName === 'string' && row.productName.trim() !== '' &&
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0 &&
      typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) && row.unitPrice >= 0 &&
      (row.tax === undefined || typeof row.tax === 'number' && Number.isFinite(row.tax) && row.tax >= 0) &&
      typeof row.total === 'number' && Number.isFinite(row.total) && row.total >= 0
  })
}

function unavailable(error: unknown) {
  if (error instanceof QuoteCustomerNotFoundError) {
    return Response.json({ error: 'Customer not found.' }, { status: 404 })
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return Response.json({ error: 'Quote conflicts with an existing record.' }, { status: 409 })
  }
  return Response.json({ error: 'Quotes are unavailable.' }, { status: 503 })
}

export async function GET(request: Request) {
  try {
    return Response.json(await listQuotes(await requireTenantContext(request)))
  } catch (error) {
    return unavailable(error)
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
    if (!validQuoteInput(body)) return Response.json({ error: 'Invalid quote payload.' }, { status: 400 })
    const id = await createQuote(await requireTenantContext(request), body)
    return Response.json({ id }, { status: 201 })
  } catch (error) {
    return unavailable(error)
  }
}
