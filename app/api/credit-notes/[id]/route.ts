import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getCreditNoteById } from '@/lib/repositories/credit-notes-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    if (!id) return Response.json({ error: 'Credit note id is required.' }, { status: 400 })

    const creditNote = await getCreditNoteById(context, id)
    return creditNote
      ? Response.json(creditNote)
      : Response.json({ error: 'Credit note not found.' }, { status: 404 })
  } catch {
    return Response.json({ error: 'Credit note is unavailable.' }, { status: 503 })
  }
}