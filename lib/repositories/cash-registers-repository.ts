import 'server-only'

import { query, withTransaction } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { calculateCashRegisterTotals } from '@/lib/cash-register'

export type CashRegister = {
  id: string
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  status: 'open' | 'closed'
  opened_by_name: string | null
  closed_by_name: string | null
}

export type CashRegisterSummary = {
  cashId: string
  status: 'open' | 'closed'
  openingAmount: number
  closingAmount: number | null
  totalSales: number
  totalCardFee: number
  totalProfit: number
  difference: number | null
  expectedCash: number
  cashSales: number
  cardSales: number
  transferSales: number
  creditNotePayments: number
  cashRefunds: number
  cashWithdrawals: number
}

export class CashRegisterNotFoundError extends Error {
  constructor() {
    super('Cash register not found in the current tenant.')
    this.name = 'CashRegisterNotFoundError'
  }
}

export class CashRegisterAlreadyClosedError extends Error {
  constructor() {
    super('Cash register is already closed.')
    this.name = 'CashRegisterAlreadyClosedError'
  }
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const selectColumns = `
  cr.id, cr.opened_at, cr.closed_at, cr.opening_amount, cr.closing_amount, cr.status,
  opened_by_profile.full_name as opened_by_name,
  closed_by_profile.full_name as closed_by_name
`

const profileJoins = `
  left join app_profiles opened_by_profile
    on opened_by_profile.id = cr.opened_by
   and opened_by_profile.organization_id = cr.organization_id
   and opened_by_profile.installation_id = cr.installation_id
  left join app_profiles closed_by_profile
    on closed_by_profile.id = cr.closed_by
   and closed_by_profile.organization_id = cr.organization_id
   and closed_by_profile.installation_id = cr.installation_id
`

export async function listCashRegisters(
  context: TenantContext,
  options: { status?: 'open' | 'closed' } = {}
) {
  const values: unknown[] = [...scope(context)]
  const clauses = ['organization_id = $1', 'installation_id = $2', 'store_id = $3']

  if (options.status) {
    values.push(options.status)
    clauses.push(`status = $${values.length}`)
  }

  return (
    await query<CashRegister>(
      `select ${selectColumns}
         from cash_registers cr
         ${profileJoins}
        where ${clauses.map((clause) => `cr.${clause}`).join(' and ')}
        order by cr.opened_at desc`,
      values
    )
  ).rows
}

export async function getCashRegisterById(context: TenantContext, id: string) {
  return (
    await query<CashRegister>(
      `select ${selectColumns}
         from cash_registers cr
         ${profileJoins}
        where cr.id = $1
          and cr.organization_id = $2
          and cr.installation_id = $3
          and cr.store_id = $4`,
      [id, ...scope(context)]
    )
  ).rows[0] ?? null
}

export async function openCashRegister(context: TenantContext, openingAmount: number) {
  return (
    await query<CashRegister>(
      `insert into cash_registers (
         organization_id, installation_id, store_id, opened_by, opening_amount, status
       ) values ($1, $2, $3, $4, $5, 'open')
       returning id, opened_at, closed_at, opening_amount, closing_amount, status,
                 null::text as opened_by_name, null::text as closed_by_name`,
      [...scope(context), context.userId, openingAmount]
    )
  ).rows[0]
}

export async function closeCashRegister(
  context: TenantContext,
  id: string,
  closingAmount: number
) {
  return withTransaction(async (client) => {
    const existing = await client.query<CashRegister>(
      `select cr.id, cr.opened_at, cr.closed_at, cr.opening_amount, cr.closing_amount, cr.status,
              null::text as opened_by_name, null::text as closed_by_name
         from cash_registers cr
        where cr.id = $1
          and cr.organization_id = $2
          and cr.installation_id = $3
          and cr.store_id = $4
        for update`,
      [id, ...scope(context)]
    )
    const register = existing.rows[0]
    if (!register) throw new CashRegisterNotFoundError()
    if (register.status !== 'open') throw new CashRegisterAlreadyClosedError()

    const updated = await client.query<CashRegister>(
      `update cash_registers
          set closing_amount = $1,
              status = 'closed',
              closed_at = now(),
              closed_by = $2
        where id = $3
          and organization_id = $4
          and installation_id = $5
          and store_id = $6
        returning id, opened_at, closed_at, opening_amount, closing_amount, status,
                  null::text as opened_by_name, null::text as closed_by_name`,
      [closingAmount, context.userId, id, ...scope(context)]
    )

    return updated.rows[0]
  })
}

export async function getCashRegisterSummary(
  context: TenantContext,
  cashRegisterId: string,
  countedCash?: number
): Promise<CashRegisterSummary | null> {
  const cash = await getCashRegisterById(context, cashRegisterId)
  if (!cash) return null

  const scoped = scope(context)
  const salesResult = await query<{
    id: string; total: number; card_fee: number; cash_received: number; cash_change: number; payment_method_id: string | null
  }>(
    `select id, total, card_fee, cash_received, cash_change, payment_method_id
       from sales
      where organization_id = $1 and installation_id = $2 and store_id = $3 and cash_register_id = $4`,
    [...scoped, cashRegisterId]
  )
  const saleIds = salesResult.rows.map((sale) => sale.id)
  const [movementsResult, methodsResult, paymentsResult, itemsResult] = await Promise.all([
    query<{ movement_type: string; amount: number }>(
      `select type as movement_type, amount from cash_movements
        where organization_id = $1 and installation_id = $2 and store_id = $3 and cash_register_id = $4`,
      [...scoped, cashRegisterId]
    ),
    query<{ id: string; name: string }>(
      `select id, name from payment_methods
        where organization_id = $1 and installation_id = $2 and store_id = $3`,
      scoped
    ),
    saleIds.length
      ? query<{ sale_id: string; payment_method: string; amount: number; card_fee: number }>(
          `select sale_id, payment_method, amount, card_fee from sale_payments
            where organization_id = $1 and installation_id = $2 and store_id = $3 and sale_id = any($4::uuid[])`,
          [...scoped, saleIds]
        )
      : Promise.resolve({ rows: [] as { sale_id: string; payment_method: string; amount: number; card_fee: number }[] }),
    saleIds.length
      ? query<{ cost: number; quantity: number; total: number }>(
          `select si.cost, si.quantity, si.total from sale_items si
            inner join sales s on s.id = si.sale_id
           where s.organization_id = $1 and s.installation_id = $2 and s.store_id = $3 and si.sale_id = any($4::uuid[])`,
          [...scoped, saleIds]
        )
      : Promise.resolve({ rows: [] as { cost: number; quantity: number; total: number }[] }),
  ])

  const paymentMethods = new Map(methodsResult.rows.map((method) => [method.id, method.name]))
  const resolvedCountedCash = countedCash ?? (cash.status === 'closed' ? Number(cash.closing_amount || 0) : null)
  const totals = calculateCashRegisterTotals({
    openingAmount: Number(cash.opening_amount || 0),
    countedCash: resolvedCountedCash ?? 0,
    sales: salesResult.rows,
    movements: movementsResult.rows,
    payments: paymentsResult.rows,
    paymentMethods,
  })
  const totalProfit = itemsResult.rows.reduce((sum, item) => sum + (Number(item.total || 0) - Number(item.cost || 0) * Number(item.quantity || 0)), 0)

  return {
    cashId: cash.id,
    status: cash.status,
    openingAmount: Number(cash.opening_amount || 0),
    closingAmount: cash.closing_amount === null ? null : Number(cash.closing_amount),
    totalSales: totals.businessSales,
    totalCardFee: totals.totalCardFee,
    totalProfit: Math.max(0, totalProfit - totals.totalCardFee),
    difference: resolvedCountedCash === null ? null : totals.difference,
    expectedCash: totals.expectedCash,
    cashSales: totals.cashSales,
    cardSales: totals.cardSales,
    transferSales: totals.transferSales,
    creditNotePayments: totals.creditSales,
    cashRefunds: totals.cashRefunds,
    cashWithdrawals: totals.cashWithdrawals,
  }
}
