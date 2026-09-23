import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type ReportsData = {
  sales: {
    id: string
    total: number
    status: string
    sale_channel: string | null
    created_at: string
    card_fee: number
    shipping_cost: number
  }[]
  saleItems: {
    sale_id: string
    product_name: string
    quantity: number
    cost: number
    total: number
  }[]
  products: {
    id: string
    name: string
    stock: number
    cost: number
    sale_price: number
    category: string | null
    active: boolean
  }[]
  purchases: {
    id: string
    total: number
    created_at: string
    supplier_name: string | null
  }[]
  payments: {
    id: string
    amount: number
    payment_date: string
  }[]
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

export async function getReportsData(context: TenantContext): Promise<ReportsData> {
  const tenant = scope(context)
  const [sales, saleItems, products, purchases, payments] = await Promise.all([
    query<{
      id: string
      total: string | number
      status: string
      created_at: string
    }>(
      `select id, total, status, created_at
         from sales
        where organization_id = $1 and installation_id = $2 and store_id = $3
        order by created_at desc`,
      tenant
    ),
    query<{
      sale_id: string
      product_name: string
      quantity: string | number
      cost: string | number
      total: string | number
    }>(
      `select si.sale_id, si.product_name, si.quantity, si.cost, si.total
         from sale_items si
         inner join sales s on s.id = si.sale_id
        where s.organization_id = $1 and s.installation_id = $2 and s.store_id = $3`,
      tenant
    ),
    query<{
      id: string
      name: string
      stock: string | number
      cost: string | number
      sale_price: string | number
      category: string | null
      active: boolean
    }>(
      `select p.id, p.name, p.stock, p.cost, p.sale_price, c.name as category, p.active
         from products p
         left join categories c
           on c.id = p.category_id
          and c.organization_id = p.organization_id
          and c.installation_id = p.installation_id
          and c.store_id = p.store_id
        where p.organization_id = $1 and p.installation_id = $2 and p.store_id = $3`,
      tenant
    ),
    query<{
      id: string
      total: string | number
      created_at: string
      supplier_name: string | null
    }>(
      `select p.id, p.total, p.created_at, s.name as supplier_name
         from purchases p
         left join suppliers s
           on s.id = p.supplier_id
          and s.organization_id = p.organization_id
          and s.installation_id = p.installation_id
          and s.store_id = p.store_id
        where p.organization_id = $1 and p.installation_id = $2 and p.store_id = $3
        order by p.created_at desc`,
      tenant
    ),
    query<{
      id: string
      amount: string | number
      created_at: string
    }>(
      `select id, amount, created_at
         from sale_payments
        where organization_id = $1 and installation_id = $2 and store_id = $3
        order by created_at desc`,
      tenant
    ),
  ])

  return {
    sales: sales.rows.map((sale) => ({
      id: sale.id,
      total: Number(sale.total) || 0,
      status: sale.status,
      sale_channel: null,
      created_at: sale.created_at,
      card_fee: 0,
      shipping_cost: 0,
    })),
    saleItems: saleItems.rows.map((item) => ({
      sale_id: item.sale_id,
      product_name: item.product_name,
      quantity: Number(item.quantity) || 0,
      cost: Number(item.cost) || 0,
      total: Number(item.total) || 0,
    })),
    products: products.rows.map((product) => ({
      id: product.id,
      name: product.name,
      stock: Number(product.stock) || 0,
      cost: Number(product.cost) || 0,
      sale_price: Number(product.sale_price) || 0,
      category: product.category,
      active: product.active,
    })),
    purchases: purchases.rows.map((purchase) => ({
      id: purchase.id,
      total: Number(purchase.total) || 0,
      created_at: purchase.created_at,
      supplier_name: purchase.supplier_name,
    })),
    payments: payments.rows.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount) || 0,
      payment_date: payment.created_at,
    })),
  }
}
