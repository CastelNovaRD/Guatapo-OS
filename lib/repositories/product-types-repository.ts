import 'server-only'
import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type ProductTypeInput = { value: string; label: string; name?: string; active?: boolean }
const scope = (context: TenantContext) => [context.organizationId, context.installationId, context.storeId]

export async function listProductTypes(context: TenantContext) {
  return (await query(`select id, value, label, name, active from product_types where organization_id=$1 and installation_id=$2 and store_id=$3 order by label`, scope(context))).rows
}

export async function createProductType(context: TenantContext, input: ProductTypeInput) {
  return (await query(`insert into product_types (organization_id, installation_id, store_id, value, label, name, active) values ($1,$2,$3,$4,$5,$6,$7) returning id, value, label, name, active`, [...scope(context), input.value, input.label, input.name || input.label, input.active ?? true])).rows[0]
}

export async function updateProductType(context: TenantContext, id: string, input: ProductTypeInput) {
  return (await query(`update product_types set value=$1, label=$2, name=$3, active=$4 where id=$5 and organization_id=$6 and installation_id=$7 and store_id=$8 returning id, value, label, name, active`, [input.value, input.label, input.name || input.label, input.active ?? true, id, ...scope(context)])).rows[0] || null
}
