import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { ExportFormat, InventoryExportScope } from './export-types'
import { downloadBlob, todayIsoDate } from './export-common'
import { INVENTORY_QUICK_TEMPLATE_COLUMNS, INVENTORY_TEMPLATE_COLUMNS } from './shared-templates'

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
    if (scope === 'page') return true
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
  const scopeLabel = scope === 'page' ? 'Página actual' : scope === 'active' ? 'Solo productos activos' : scope === 'low' ? 'Solo stock bajo' : scope === 'out' ? 'Solo agotados' : scope === 'category' ? `Categoría: ${category || 'Todas'}` : 'Todo el inventario'
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
    columns: INVENTORY_TEMPLATE_COLUMNS,
    rows,
  }
  if (format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}


async function getExcelJS(): Promise<typeof import('exceljs')> {
  return await import('exceljs')
}

export async function downloadInventoryQuickTemplate() {
  const ExcelJS = await getExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CastelNova OS'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Productos')
  const instructions = workbook.addWorksheet('Instrucciones')

  sheet.addRow(INVENTORY_QUICK_TEMPLATE_COLUMNS.map((column) => column.header))
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } }
  sheet.columns = INVENTORY_QUICK_TEMPLATE_COLUMNS.map((column) => ({ width: column.width || 18 }))

  instructions.addRow(['Plantilla rápida de importación de inventario'])
  instructions.addRow([])
  instructions.addRow(['Columnas obligatorias:', 'Nombre, Categoria, Stock, Costo, Precio de venta'])
  instructions.addRow(['No cambies los nombres de las columnas.'])
  instructions.addRow(['Stock debe ser un número entero. Costo y precio deben ser números.'])
  instructions.addRow(['La categoria debe existir o se procesará según la opción seleccionada en el importador.'])
  instructions.addRow(['SKU y código de barras se generan automáticamente si el producto es nuevo.'])
  instructions.addRow(['Imágenes y descripción se agregan luego desde el sistema.'])
  instructions.addRow([])
  instructions.addRow(['Ejemplos de referencia. No los copies en la hoja Productos si no deseas importarlos:'])
  instructions.addRow(['Cargador Samsung 25W', 'Cargadores', 20, 250, 450])
  instructions.addRow(['Cable USB-C', 'Cables y Cargadores', 50, 80, 180])
  instructions.addRow(['Mouse Logitech M90', 'Accesorios y Periféricos', 15, 300, 550])
  instructions.columns = [{ width: 34 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 18 }]
  instructions.getRow(1).font = { bold: true, size: 14 }

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(`plantilla-rapida-inventario-guatapo-${todayIsoDate()}.xlsx`, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
