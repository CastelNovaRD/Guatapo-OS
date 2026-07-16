import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { ExportFormat, InventoryExportScope } from './export-types'
import { todayIsoDate } from './export-common'

type InventoryProduct = {
  sku: string | null
  barcode: string | null
  name: string
  category: string | null
  stock: number
  cost: number
  sale_price: number
  active: boolean | null
}

type ExportInventoryParams = {
  products: InventoryProduct[]
  format: ExportFormat
  scope: InventoryExportScope
  category?: string
}

function filterProducts(products: InventoryProduct[], scope: InventoryExportScope, category?: string) {
  return products.filter((product) => {
    if (scope === 'active') return product.active !== false
    if (scope === 'low') return product.active !== false && Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 2
    if (scope === 'out') return product.active !== false && Number(product.stock || 0) <= 0
    if (scope === 'category') return category ? product.category === category : true
    return true
  })
}

export async function exportInventory({ products, format, scope, category }: ExportInventoryParams) {
  const filtered = filterProducts(products, scope, category)
  const activeProducts = products.filter((product) => product.active !== false)
  const rows = filtered.map((product) => ({
    code: product.sku || product.barcode || '',
    product: product.name,
    category: product.category || '',
    stock: Number(product.stock || 0),
    cost: Number(product.cost || 0),
    salePrice: Number(product.sale_price || 0),
    inventoryValue: Number(product.cost || 0) * Number(product.stock || 0),
    stockStatus: Number(product.stock || 0) <= 0 ? 'Agotado' : Number(product.stock || 0) <= 2 ? 'Stock bajo' : 'Disponible',
    activeStatus: product.active === false ? 'Inactivo' : 'Activo',
  }))
  const scopeLabel = scope === 'active' ? 'Solo productos activos' : scope === 'low' ? 'Solo stock bajo' : scope === 'out' ? 'Solo agotados' : scope === 'category' ? `Categoria: ${category || 'Todas'}` : 'Todo el inventario'
  const document = {
    title: 'Inventario',
    filename: `inventario-guatapo-${todayIsoDate()}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
    filters: [scopeLabel],
    orientation: 'landscape' as const,
    summary: [
      { label: 'Productos activos', value: activeProducts.length, type: 'number' as const },
      { label: 'Valor total del inventario', value: activeProducts.reduce((sum, product) => sum + Number(product.cost || 0) * Number(product.stock || 0), 0), type: 'money' as const },
      { label: 'Stock bajo', value: activeProducts.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 2).length, type: 'number' as const },
      { label: 'Agotados', value: activeProducts.filter((product) => Number(product.stock || 0) <= 0).length, type: 'number' as const },
    ],
    columns: [
      { key: 'code', header: 'SKU o codigo', width: 18 },
      { key: 'product', header: 'Producto', width: 32 },
      { key: 'category', header: 'Categoria', width: 18 },
      { key: 'stock', header: 'Stock', type: 'number' as const, align: 'right' as const, width: 10 },
      { key: 'cost', header: 'Costo', type: 'money' as const, width: 14 },
      { key: 'salePrice', header: 'Precio de venta', type: 'money' as const, width: 16 },
      { key: 'inventoryValue', header: 'Valor del inventario', type: 'money' as const, width: 18 },
      { key: 'stockStatus', header: 'Estado', width: 14 },
      { key: 'activeStatus', header: 'Activo/Inactivo', width: 15 },
    ],
    rows,
  }
  if (format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}
