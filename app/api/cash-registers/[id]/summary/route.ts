import { requireTenantContext } from '@/lib/auth/tenant-context'
import { query } from '@/lib/db'
import { calculateCashRegisterTotals } from '@/lib/cash-register'

type CashRegisterRow = {
  id: string
  status: string
  opening_amount: number
}

type SaleRow = {
  id: string
  total: number
  card_fee: number
  cash_received: number
  cash_change: number
  payment_method_id: string | null
}

type SalePaymentRow = {
  sale_id: string
  payment_method: string
  amount: number
  card_fee: number
}

type RefundRow = {
  sale_id: string | null
  total: number
  refund_method: string | null
}

type MovementRow = {
  movement_type: string
  amount: number
}

type ItemRow = {
  cost: number
  quantity: number
  total: number
}

type PaymentMethodRow = {
  id: string
  name: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params

    const countedCashParam = new URL(request.url).searchParams.get('countedCash')
    const countedCash = Number(countedCashParam ?? 0)

    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return Response.json(
        { error: 'Invalid counted cash.' },
        { status: 400 }
      )
    }

    const scope = [
      context.organizationId,
      context.installationId,
      context.storeId,
    ]

    const cashResult = await query<CashRegisterRow>(
      `select id, status, opening_amount
         from cash_registers
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        limit 1`,
      [id, ...scope]
    )

    const cash = cashResult.rows[0]

    if (!cash) {
      return Response.json(
        { error: 'Cash register not found.' },
        { status: 404 }
      )
    }

    if (cash.status !== 'open') {
      return Response.json(
        { error: 'Cash register is already closed.' },
        { status: 409 }
      )
    }

    const salesResult = await query<SaleRow>(
      `select
         id,
         total,
         card_fee,
         cash_received,
         cash_change,
         payment_method_id
       from sales
       where organization_id = $1
         and installation_id = $2
         and store_id = $3
         and cash_register_id = $4`,
      [...scope, id]
    )

    const sales = salesResult.rows
    const saleIds = sales.map((sale) => sale.id)

    let payments: SalePaymentRow[] = []
    let refunds: RefundRow[] = []
    let items: ItemRow[] = []

    if (saleIds.length > 0) {
      const [paymentsResult, refundsResult, itemsResult] =
        await Promise.all([
          query<SalePaymentRow>(
            `select
               sale_id,
               payment_method,
               amount,
               card_fee
             from sale_payments
             where organization_id = $1
               and installation_id = $2
               and store_id = $3
               and sale_id = any($4::uuid[])`,
            [...scope, saleIds]
          ),

          query<RefundRow>(
            `select
               sale_id,
               total,
               refund_method
             from credit_notes
             where organization_id = $1
               and installation_id = $2
               and store_id = $3
               and sale_id = any($4::uuid[])`,
            [...scope, saleIds]
          ),

          query<ItemRow>(
            `select
               si.cost,
               si.quantity,
               si.total
             from sale_items si
             inner join sales s
               on s.id = si.sale_id
             where s.organization_id = $1
               and s.installation_id = $2
               and s.store_id = $3
               and si.sale_id = any($4::uuid[])`,
            [...scope, saleIds]
          ),
        ])

      payments = paymentsResult.rows
      refunds = refundsResult.rows
      items = itemsResult.rows
    }

    const [movementsResult, methodsResult] = await Promise.all([
      query<MovementRow>(
        `select type as movement_type, amount
           from cash_movements
          where organization_id = $1
            and installation_id = $2
            and store_id = $3
            and cash_register_id = $4`,
        [...scope, id]
      ),

      query<PaymentMethodRow>(
        `select id, name
           from payment_methods
          where organization_id = $1
            and installation_id = $2
            and store_id = $3`,
        scope
      ),
    ])

    const paymentMethodMap = new Map<string, string>()

    for (const method of methodsResult.rows) {
      paymentMethodMap.set(method.id, method.name || '')
    }

    const totals = calculateCashRegisterTotals({
      openingAmount: Number(cash.opening_amount || 0),
      countedCash,
      sales,
      refunds,
      movements: movementsResult.rows,
      payments,
      paymentMethods: paymentMethodMap,
    })

    const totalProfit = items.reduce(
      (sum, item) =>
        sum +
        (Number(item.total || 0) -
          Number(item.cost || 0) * Number(item.quantity || 1)),
      0
    )

    return Response.json({
      cashId: cash.id,
      openingAmount: Number(cash.opening_amount || 0),
      manualIn: 0,
      manualOut: 0,
      totalSales: totals.expectedCash,
      totalCardFee: totals.totalCardFee,
      totalProfit: Math.max(0, totalProfit - totals.totalCardFee),
      difference: totals.difference,
      closingAmount: countedCash,
      expectedCash: totals.expectedCash,
      cashSales: totals.cashSales,
      cardSales: totals.cardSales,
      transferSales: totals.transferSales,
      cashRefunds: totals.cashRefunds,
      cashWithdrawals: totals.cashWithdrawals,
      creditNotePayments: totals.creditSales,
    })
  } catch (error) {
    console.error('[CASH REGISTER SUMMARY]', error)

    return Response.json(
      { error: 'No se pudo calcular el resumen de caja.' },
      { status: 503 }
    )
  }
}