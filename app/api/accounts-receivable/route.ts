import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  getReceivablePaymentMethod,
  getReceivableSaleItems,
  listReceivableCustomers,
  listReceivablePayments,
  listReceivableSales,
  registerReceivablePayment,
} from '@/lib/repositories/accounts-receivable-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown) {
  console.error('[ACCOUNTS RECEIVABLE API]', error)

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Accounts receivable data is unavailable.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams
    const saleId = params.get('saleId')?.trim()

    if (saleId) {
      const sales = await listReceivableSales(context)
      const sale = sales.find((item) => item.id === saleId)

      if (!sale) {
        return Response.json(
          { error: 'Sale not found.' },
          { status: 404 }
        )
      }

      const [items, paymentMethod] = await Promise.all([
        getReceivableSaleItems(context, sale.id),
        sale.payment_method_id
          ? getReceivablePaymentMethod(
              context,
              sale.payment_method_id
            )
          : Promise.resolve(null),
      ])

      return Response.json({
        sale,
        items,
        paymentMethod,
      })
    }

    const sales = await listReceivableSales(context)

    const saleIds = sales.map((sale) => sale.id)

    const customerIds = Array.from(
      new Set(
        sales
          .map((sale) => sale.customer_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    const [customers, payments] = await Promise.all([
      listReceivableCustomers(context, customerIds),
      listReceivablePayments(context, saleIds),
    ])

    return Response.json({
      sales,
      customers,
      payments,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    const body = (await request.json()) as {
      saleIds?: unknown
      amount?: unknown
      paymentDate?: unknown
      reference?: unknown
      notes?: unknown
    }

    const saleIds = Array.isArray(body.saleIds)
      ? body.saleIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : []

    const amount = Number(body.amount)

    const paymentDate =
      typeof body.paymentDate === 'string'
        ? body.paymentDate
        : null

    const reference =
      typeof body.reference === 'string'
        ? body.reference
        : null

    const notes =
      typeof body.notes === 'string'
        ? body.notes
        : null

    const result = await registerReceivablePayment(
      context,
      {
        saleIds,
        amount,
        paymentDate,
        reference,
        notes,
      }
    )

    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}