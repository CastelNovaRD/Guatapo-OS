export type CashRegisterSale = {
  id?: string | null
  total: number | null
  card_fee?: number | null
  cash_received?: number | null
  cash_change?: number | null
  payment_method_id?: string | null
}

export type CashRegisterSalePayment = {
  sale_id?: string | null
  payment_method?: string | null
  amount?: number | null
  card_fee?: number | null
}

export type CashRegisterMovement = {
  movement_type?: string | null
  amount?: number | null
}

export type CashRegisterRefund = {
  total: number | null
  refund_method?: string | null
}

export type CashRegisterPaymentMethod = {
  id: string
  name: string | null
}

export type CashRegisterTotals = {
  businessSales: number
  expectedCash: number
  cashSales: number
  cardSales: number
  transferSales: number
  creditSales: number
  cashRefunds: number
  cardRefunds: number
  transferRefunds: number
  cashWithdrawals: number
  cashDeposits: number
  totalCardFee: number
  difference: number
}

function normalize(value: string | null | undefined) {
  return (value || '').toLowerCase()
}

export function getPaymentKind(
  sale: CashRegisterSale,
  paymentMethods: Map<string, string>
): 'cash' | 'card' | 'transfer' | 'credit' {
  const methodId = normalize(sale.payment_method_id)
  const methodName = sale.payment_method_id ? normalize(paymentMethods.get(sale.payment_method_id)) : ''
  const methodText = methodId + ' ' + methodName

  if (methodText.includes('efectivo') || Number(sale.cash_received || 0) > 0) return 'cash'
  if (methodText.includes('tarjeta') || methodText.includes('card') || Number(sale.card_fee || 0) > 0) return 'card'
  if (methodText.includes('credito') || methodText.includes('credit')) return 'credit'

  return 'transfer'
}

export function getRefundKind(refundMethod: string | null | undefined): 'cash' | 'card' | 'transfer' | 'credit' {
  const method = normalize(refundMethod)

  if (method.includes('efectivo')) return 'cash'
  if (method.includes('tarjeta')) return 'card'
  if (method.includes('credito') || method.includes('credit')) return 'credit'

  return 'transfer'
}

export function calculateCashRegisterTotals({
  openingAmount,
  countedCash,
  sales,
  refunds = [],
  movements = [],
  payments = [],
  paymentMethods,
}: {
  openingAmount: number
  countedCash: number
  sales: CashRegisterSale[]
  refunds?: CashRegisterRefund[]
  movements?: CashRegisterMovement[]
  payments?: CashRegisterSalePayment[]
  paymentMethods: Map<string, string>
}): CashRegisterTotals {
  const totals: CashRegisterTotals = {
    businessSales: 0,
    expectedCash: Number(openingAmount || 0),
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    creditSales: 0,
    cashRefunds: 0,
    cardRefunds: 0,
    transferRefunds: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    totalCardFee: 0,
    difference: 0,
  }

  const salesWithDetailedPayments = new Set(
    payments.map((payment) => payment.sale_id).filter(Boolean)
  )

  for (const payment of payments) {
    const amount = Number(payment.amount || 0)
    const cardFee = Number(payment.card_fee || 0)
    const method = normalize(payment.payment_method)

    if (amount <= 0) continue

    totals.totalCardFee += cardFee

    if (method === 'cash') {
      totals.cashSales += amount
      totals.businessSales += amount
      totals.expectedCash += amount
    } else if (method === 'card') {
      totals.cardSales += amount
      totals.businessSales += amount
    } else if (method === 'credit_note') {
      totals.creditSales += amount
    } else {
      totals.transferSales += amount
      totals.businessSales += amount
    }
  }

  for (const sale of sales) {
    if (sale.id && salesWithDetailedPayments.has(sale.id)) continue

    const total = Number(sale.total || 0)
    const cardFee = Number(sale.card_fee || 0)
    const businessTotal = Math.max(0, total - cardFee)
    const kind = getPaymentKind(sale, paymentMethods)

    totals.businessSales += businessTotal
    totals.totalCardFee += cardFee

    if (kind === 'cash') {
      const cashReceived = Number(sale.cash_received || 0)
      const cashChange = Number(sale.cash_change || 0)
      const physicalCash = cashReceived > 0 ? Math.max(0, cashReceived - cashChange) : businessTotal
      totals.cashSales += physicalCash
      totals.expectedCash += physicalCash
    } else if (kind === 'card') {
      totals.cardSales += businessTotal
    } else if (kind === 'credit') {
      totals.creditSales += businessTotal
    } else {
      totals.transferSales += businessTotal
    }
  }

  for (const refund of refunds) {
    const total = Number(refund.total || 0)
    const kind = getRefundKind(refund.refund_method)

    if (kind === 'cash') {
      totals.cashRefunds += total
      totals.expectedCash -= total
    } else if (kind === 'card') {
      totals.cardRefunds += total
    } else if (kind === 'transfer') {
      totals.transferRefunds += total
    }
  }

  for (const movement of movements) {
    const amount = Number(movement.amount || 0)
    const type = normalize(movement.movement_type)

    if (type === 'withdrawal') {
      totals.cashWithdrawals += amount
      totals.expectedCash -= amount
    } else if (type === 'deposit') {
      totals.cashDeposits += amount
      totals.expectedCash += amount
    }
  }

  totals.difference = Number(countedCash || 0) - totals.expectedCash

  return totals
}
