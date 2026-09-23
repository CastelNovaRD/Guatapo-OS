import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  convertQuoteToSale,
  QuoteAlreadyConvertedError,
  QuoteConversionNotFoundError,
  QuoteConversionStockError,
  QuoteConversionValidationError,
  QuoteNcfUnavailableError,
} from '@/lib/repositories/quote-sales-repository'

const tenantFields = new Set([
  'organization_id', 'installation_id', 'store_id',
  'organizationId', 'installationId', 'storeId',
])

function errorResponse(error: unknown) {
  if (error instanceof QuoteConversionNotFoundError) {
    return Response.json({ error: 'Quote not found.' }, { status: 404 })
  }
  if (error instanceof QuoteAlreadyConvertedError) {
    return Response.json({ error: 'Quote has already been converted.' }, { status: 409 })
  }
  if (error instanceof QuoteConversionStockError) {
    return Response.json({ error: 'Insufficient inventory to convert this quote.' }, { status: 409 })
  }
  if (error instanceof QuoteNcfUnavailableError) {
    return Response.json({ error: 'No active NCF is available for this receipt type.' }, { status: 409 })
  }
  if (error instanceof QuoteConversionValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return Response.json({ error: 'The sale conflicts with an existing record.' }, { status: 409 })
  }
  return Response.json({ error: 'Quote conversion is unavailable.' }, { status: 503 })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id.trim()) return Response.json({ error: 'Quote ID is required.' }, { status: 400 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid quote conversion input.' }, { status: 400 })
    }
    const input = body as Record<string, unknown>
    if (
      Object.keys(input).some((key) => key !== 'fiscalReceiptType') ||
      [...tenantFields].some((field) => field in input) ||
      typeof input.fiscalReceiptType !== 'string' ||
      !input.fiscalReceiptType.trim()
    ) {
      return Response.json({ error: 'Invalid quote conversion input.' }, { status: 400 })
    }

    const converted = await convertQuoteToSale(
      await requireTenantContext(request),
      id,
      { fiscalReceiptType: input.fiscalReceiptType.trim() }
    )
    return Response.json(converted, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
