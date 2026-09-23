import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type DashboardSale = {
  id: string
  total: number
  created_at: string
  invoice_number: string | null
  card_fee: number
  shipping_cost: number
}

export type DashboardSaleItem = {
  sale_id: string
  quantity: number
  cost: number
  total: number
}

export type DashboardProduct = {
  id: string
  name: string
  stock: number
  active: boolean
}

export type DashboardData = {
  sales: DashboardSale[]
  saleItems: DashboardSaleItem[]
  products: DashboardProduct[]
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

export async function getDashboardData(
  context: TenantContext
): Promise<DashboardData> {
  const tenant = scope(context)

  const salesResult = await query<{
    id: string
    total: string | number
    created_at: string
    invoice_number: string | null
  }>(
    `
      select
        id,
        total,
        created_at,
        invoice_number
      from sales
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
      order by created_at desc
    `,
    tenant
  )

  const productsResult = await query<{
    id: string
    name: string
    stock: string | number
    active: boolean
  }>(
    `
      select
        id,
        name,
        stock,
        active
      from products
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
    `,
    tenant
  )

  const saleItemsResult = await query<{
    sale_id: string
    quantity: string | number
    cost: string | number
    total: string | number
  }>(
    `
      select
        si.sale_id,
        si.quantity,
        si.cost,
        si.total
      from sale_items si
      inner join sales s on s.id = si.sale_id
      where s.organization_id = $1
        and s.installation_id = $2
        and s.store_id = $3
    `,
    tenant
  )

  return {
    sales: salesResult.rows.map((sale) => ({
      id: sale.id,
      total: Number(sale.total) || 0,
      created_at: sale.created_at,
      invoice_number: sale.invoice_number,
      card_fee: 0,
      shipping_cost: 0,
    })),
    saleItems: saleItemsResult.rows.map((item) => ({
      sale_id: item.sale_id,
      quantity: Number(item.quantity) || 0,
      cost: Number(item.cost) || 0,
      total: Number(item.total) || 0,
    })),
    products: productsResult.rows.map((product) => ({
      id: product.id,
      name: product.name,
      stock: Number(product.stock) || 0,
      active: product.active,
    })),
  }
}
