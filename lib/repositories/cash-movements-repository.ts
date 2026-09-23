import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type CashMovement = {
  id: string
  cash_register_id: string | null
  type: string
  amount: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const selectColumns = `
  id,
  cash_register_id,
  type,
  amount,
  reference_type,
  reference_id,
  notes,
  created_by,
  created_at
`

export async function listCashMovements(
  context: TenantContext,
  options: {
    cashRegisterId?: string
    type?: string
  } = {}
) {
  const values: unknown[] = [...scope(context)]
  const clauses = [
    'organization_id = $1',
    'installation_id = $2',
    'store_id = $3',
  ]

  if (options.cashRegisterId) {
    values.push(options.cashRegisterId)
    clauses.push(`cash_register_id = $${values.length}`)
  }

  if (options.type) {
    values.push(options.type)
    clauses.push(`type = $${values.length}`)
  }

  return (
    await query<CashMovement>(
      `select ${selectColumns}
         from cash_movements
        where ${clauses.join(' and ')}
        order by created_at desc`,
      values
    )
  ).rows
}

export async function createCashWithdrawal(
  context: TenantContext,
  input: {
    cashRegisterId: string
    amount: number
    notes?: string | null
  }
) {
  return (
    await query<CashMovement>(
      `insert into cash_movements (
         organization_id,
         installation_id,
         store_id,
         cash_register_id,
         type,
         amount,
         notes,
         created_by
       )
       values ($1, $2, $3, $4, 'withdrawal', $5, $6, $7)
       returning ${selectColumns}`,
      [
        ...scope(context),
        input.cashRegisterId,
        input.amount,
        input.notes?.trim() || null,
        context.userId,
      ]
    )
  ).rows[0]
}