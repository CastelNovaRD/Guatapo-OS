import { requireTenantContext } from '@/lib/auth/tenant-context'
import { query } from '@/lib/db'

type NcfRow = {
  id: string
  prefix: string
  next_number: string | number
  range_end: string | number
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    const receiptType = params.get('type')?.trim()

    if (!receiptType) {
      return Response.json(
        { error: 'Receipt type is required.' },
        { status: 400 }
      )
    }

    const result = await query<NcfRow>(
      `select id, prefix, next_number, range_end
         from ncf_receipts
        where organization_id = $1
          and installation_id = $2
          and store_id = $3
          and receipt_type = $4
          and active = true
          and (expires_at is null or expires_at >= current_date)
          and next_number <= range_end
        limit 1`,
      [
        context.organizationId,
        context.installationId,
        context.storeId,
        receiptType,
      ]
    )

    const receipt = result.rows[0]

    if (!receipt) {
      return Response.json(null)
    }

    return Response.json({
      id: receipt.id,
      ncf: `${receipt.prefix}${receipt.next_number}`,
    })
  } catch (error) {
    console.error('[NCF NEXT]', error)

    return Response.json(
      { error: 'No se pudo consultar el NCF disponible.' },
      { status: 503 }
    )
  }
}