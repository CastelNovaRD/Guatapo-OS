import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type PaymentMethod = {
  id: string
  name: string
  kind: string
  fee_percent: number
}

export async function listPaymentMethods(context: TenantContext) {
  return (
    await query<PaymentMethod>(
      `select id, name, kind, fee_percent
         from payment_methods
        where organization_id = $1
          and installation_id = $2
          and store_id = $3
          and active = true
        order by fee_percent asc, name asc`,
      [
        context.organizationId,
        context.installationId,
        context.storeId,
      ]
    )
  ).rows
}