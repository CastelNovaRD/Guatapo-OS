import { requireTenantContext } from '@/lib/auth/tenant-context'
import { findAvailableCreditNote } from '@/lib/repositories/pos-sales-repository'

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    const number = params.get('number')?.trim()

    if (!number) {
      return Response.json(
        { error: 'Credit note number is required.' },
        { status: 400 }
      )
    }

    const note = await findAvailableCreditNote(context, number)

    if (!note) {
      return Response.json(
        { error: 'Credit note not found.' },
        { status: 404 }
      )
    }

    return Response.json(note)
  } catch (error) {
    console.error('[CREDIT NOTE LOOKUP]', error)

    return Response.json(
      { error: 'Credit note lookup is unavailable.' },
      { status: 503 }
    )
  }
}