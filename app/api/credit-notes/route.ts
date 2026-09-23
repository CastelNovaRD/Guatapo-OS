import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createCreditNote,
  CreditNoteSaleNotFoundError,
  CreditNoteValidationError,
  findSaleForCreditNote,
  type CreateCreditNoteInput,
} from '@/lib/repositories/credit-notes-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal error.'
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    const search = params.get('search')?.trim()

    if (!search) {
      return Response.json(
        { error: 'Invoice number or sale ID is required.' },
        { status: 400 }
      )
    }

    const result = await findSaleForCreditNote(context, search)

    if (!result) {
      return Response.json(
        { error: 'Sale not found.' },
        { status: 404 }
      )
    }

    return Response.json(result)
  } catch (error) {
    console.error('[CREDIT NOTES GET]', error)

    return Response.json(
      { error: 'Credit note sale lookup is unavailable.' },
      { status: 503 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }

    const input = body as Partial<CreateCreditNoteInput>

    if (
      typeof input.saleId !== 'string' ||
      typeof input.refundMethod !== 'string' ||
      typeof input.reason !== 'string' ||
      !Array.isArray(input.items)
    ) {
      return Response.json(
        { error: 'Invalid credit note payload.' },
        { status: 400 }
      )
    }

    const id = await createCreditNote(context, {
      saleId: input.saleId,
      refundMethod: input.refundMethod,
      reason: input.reason,
      reasonOther:
        typeof input.reasonOther === 'string'
          ? input.reasonOther
          : null,
      notes:
        typeof input.notes === 'string'
          ? input.notes
          : null,
      items: input.items,
    })

    return Response.json({ id }, { status: 201 })
  } catch (error) {
    if (error instanceof CreditNoteValidationError) {
      return Response.json(
        { error: error.message },
        { status: 400 }
      )
    }

    if (error instanceof CreditNoteSaleNotFoundError) {
      return Response.json(
        { error: error.message },
        { status: 404 }
      )
    }

    console.error('[CREDIT NOTES POST]', error)

    return Response.json(
      { error: errorMessage(error) },
      { status: 503 }
    )
  }
}