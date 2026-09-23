import 'server-only'

import type { QueryResultRow } from 'pg'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type InventorySummary = {
  totalProducts: number
  activeProducts: number
  lowStockProducts: number
  outOfStockProducts: number
  totalStockUnits: number
  inventoryCostValue: number
  inventorySaleValue: number
}

type InventorySummaryRow = QueryResultRow & {
  total_products: string | number
  active_products: string | number
  low_stock_products: string | number
  out_of_stock_products: string | number
  total_stock_units: string | number
  inventory_cost_value: string | number
  inventory_sale_value: string | number
}

function numeric(value: string | number | null | undefined) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export async function getInventorySummary(context: TenantContext): Promise<InventorySummary> {
  const result = await query<InventorySummaryRow>(
    `select
       count(*) as total_products,
       count(*) filter (where active) as active_products,
       count(*) filter (where active and stock > 0 and stock <= stock_min) as low_stock_products,
       count(*) filter (where active and stock <= 0) as out_of_stock_products,
       coalesce(sum(stock), 0) as total_stock_units,
       coalesce(sum(stock * cost), 0) as inventory_cost_value,
       coalesce(sum(stock * sale_price), 0) as inventory_sale_value
     from products
     where organization_id = $1
       and installation_id = $2
       and store_id = $3`,
    [context.organizationId, context.installationId, context.storeId]
  )
  const row = result.rows[0]

  return {
    totalProducts: numeric(row?.total_products),
    activeProducts: numeric(row?.active_products),
    lowStockProducts: numeric(row?.low_stock_products),
    outOfStockProducts: numeric(row?.out_of_stock_products),
    totalStockUnits: numeric(row?.total_stock_units),
    inventoryCostValue: numeric(row?.inventory_cost_value),
    inventorySaleValue: numeric(row?.inventory_sale_value),
  }
}
